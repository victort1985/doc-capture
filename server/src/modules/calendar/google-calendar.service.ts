import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { google } from 'googleapis';
import { Calendar } from './entities/calendar.entity';
import { CalendarEvent, CalendarEventType } from './entities/calendar-event.entity';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger('GoogleCalendarService');

  constructor(
    @InjectRepository(Calendar) private readonly calendarsRepo: Repository<Calendar>,
    @InjectRepository(CalendarEvent) private readonly eventsRepo: Repository<CalendarEvent>,
  ) {}

  private oauthClient() {
    return new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
  }

  /** Builds the URL to send the admin to for Google's consent screen.
   * `state` carries the organization's calendar id through the redirect. */
  getAuthUrl(calendarId: number): string {
    const client = this.oauthClient();
    return client.generateAuthUrl({
      access_type: 'offline', // needed to get back a refresh_token
      prompt: 'consent',      // force re-consent so we always get a refresh_token,
                               // even if this Google account connected before
      scope: SCOPES,
      state: String(calendarId),
    });
  }

  /** Exchanges the one-time code Google sent back for tokens, and stores
   * the refresh token + connected account email on the calendar row. */
  async handleCallback(code: string, calendarId: number): Promise<void> {
    const client = this.oauthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error(
        'Google did not return a refresh token. Disconnect this app from ' +
        'https://myaccount.google.com/permissions and try connecting again.',
      );
    }
    client.setCredentials(tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const { data: profile } = await oauth2.userinfo.get();

    const calendar = await this.calendarsRepo.findOne({ where: { id: calendarId } });
    if (!calendar) throw new Error('Calendar not found');

    calendar.googleRefreshToken = tokens.refresh_token;
    calendar.googleConnectedEmail = profile.email ?? undefined;
    calendar.googleCalendarId = 'primary';
    calendar.googleSyncToken = undefined; // force a full sync on first run
    await this.calendarsRepo.save(calendar);
  }

  async disconnect(calendarId: number): Promise<void> {
    const calendar = await this.calendarsRepo.findOne({ where: { id: calendarId } });
    if (!calendar) return;
    calendar.googleRefreshToken = undefined;
    calendar.googleConnectedEmail = undefined;
    calendar.googleCalendarId = undefined;
    calendar.googleSyncToken = undefined;
    calendar.googleLastSyncedAt = undefined;
    await this.calendarsRepo.save(calendar);
  }

  /** Pulls whatever changed on the connected Google calendar since the
   * last sync (or everything, on the first run) and mirrors it into
   * Vixor's calendar_events — one-way, Google is always the source of
   * truth for these rows. Events removed from Google are removed here too. */
  async syncCalendar(calendarId: number): Promise<{ imported: number; updated: number; removed: number }> {
    // select: false hides googleRefreshToken by default — pull it explicitly.
    const calendar = await this.calendarsRepo
      .createQueryBuilder('c')
      .addSelect('c.googleRefreshToken')
      .where('c.id = :id', { id: calendarId })
      .getOne();
    if (!calendar?.googleRefreshToken) return { imported: 0, updated: 0, removed: 0 };

    const client = this.oauthClient();
    client.setCredentials({ refresh_token: calendar.googleRefreshToken });
    const gcal = google.calendar({ version: 'v3', auth: client });

    let imported = 0, updated = 0, removed = 0;
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;

    try {
      do {
        const res = await gcal.events.list({
          calendarId: calendar.googleCalendarId || 'primary',
          syncToken: calendar.googleSyncToken || undefined,
          pageToken,
          singleEvents: true, // expand recurring events into individual instances
          maxResults: 250,
        });

        for (const gEvent of res.data.items ?? []) {
          if (!gEvent.id) continue;

          if (gEvent.status === 'cancelled') {
            let existing = await this.eventsRepo.findOne({ where: { googleEventId: gEvent.id } });
            if (!existing && gEvent.iCalUID) {
              existing = await this.eventsRepo.findOne({
                where: { calendar: { id: calendar.id }, technicalRequirements: `ics-uid:${gEvent.iCalUID}` },
              });
            }
            if (existing) {
              await this.eventsRepo.remove(existing);
              removed++;
            }
            continue;
          }

          const startAt = gEvent.start?.dateTime ?? gEvent.start?.date;
          if (!startAt) continue;
          const endAt = gEvent.end?.dateTime ?? gEvent.end?.date;
          const allDay = !gEvent.start?.dateTime;

          let row = await this.eventsRepo.findOne({ where: { googleEventId: gEvent.id } });
          if (!row && gEvent.iCalUID) {
            // This event may already exist from an earlier one-time .ics
            // import (calendar.service.ts dedups those by this same UID
            // format) — adopt that row instead of creating a duplicate.
            row = await this.eventsRepo.findOne({
              where: { calendar: { id: calendar.id }, technicalRequirements: `ics-uid:${gEvent.iCalUID}` },
            });
          }
          const isNew = !row;
          row = row ?? this.eventsRepo.create({ calendar });
          row.googleEventId = gEvent.id;
          row.calendar = calendar;
          row.type = CalendarEventType.EVENT;
          row.title = gEvent.summary || '(untitled Google event)';
          row.description = gEvent.description ?? undefined;
          row.startAt = new Date(startAt);
          row.endAt = endAt ? new Date(endAt) : undefined;
          row.allDay = allDay;
          row.location = gEvent.location ?? undefined;
          await this.eventsRepo.save(row);
          isNew ? imported++ : updated++;
        }

        pageToken = res.data.nextPageToken ?? undefined;
        nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
    } catch (err: any) {
      // A 410 means our sync token expired (e.g. too much time passed) —
      // Google requires a full resync from scratch in that case.
      if (err?.code === 410) {
        calendar.googleSyncToken = undefined;
        await this.calendarsRepo.save(calendar);
        return this.syncCalendar(calendarId);
      }
      this.logger.error(`Google Calendar sync failed for calendar ${calendarId}: ${err?.message}`);
      throw err;
    }

    calendar.googleSyncToken = nextSyncToken;
    calendar.googleLastSyncedAt = new Date();
    await this.calendarsRepo.save(calendar);

    return { imported, updated, removed };
  }

  /** Runs on a schedule (see GoogleCalendarCron) — syncs every calendar
   * that has a Google account connected. */
  async syncAllConnected(): Promise<void> {
    const calendars = await this.calendarsRepo
      .createQueryBuilder('c')
      .addSelect('c.googleRefreshToken')
      .where('c.googleRefreshToken IS NOT NULL')
      .getMany();
    for (const cal of calendars) {
      try {
        await this.syncCalendar(cal.id);
      } catch (err: any) {
        this.logger.error(`Skipping calendar ${cal.id}: ${err?.message}`);
      }
    }
  }
}
