import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Calendar } from './entities/calendar.entity';
import { CalendarEvent, CalendarEventType } from './entities/calendar-event.entity';
import { CalendarAttachment } from './entities/calendar-attachment.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { StorageService } from '../storage/storage.service';
import { processPhoto } from '../files/processors/photo.processor';
import { encryptBuffer } from '../../common/crypto/encryption.util';

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(Calendar) private readonly calendarsRepo: Repository<Calendar>,
    @InjectRepository(CalendarEvent) private readonly eventsRepo: Repository<CalendarEvent>,
    @InjectRepository(CalendarAttachment) private readonly attachmentsRepo: Repository<CalendarAttachment>,
    private readonly storageService: StorageService,
  ) {}

  // ----- Calendar (one shared per organization) -----

  async listOrgsWithCalendars(): Promise<Calendar[]> {
    return this.calendarsRepo.find({ relations: ['organization'], order: { id: 'ASC' } });
  }

  /** Returns (and creates if needed) the ICS secret token for an org's calendar. */
  async getIcsToken(organizationId: number): Promise<string> {
    let cal = await this.calendarsRepo.findOne({ where: { organization: { id: organizationId } } });
    if (!cal) cal = await this.getOrCreateOrgCalendar(organizationId, 0);
    if (!cal.icsToken) {
      cal.icsToken = require('crypto').randomBytes(24).toString('hex');
      await this.calendarsRepo.save(cal);
    }
    return cal.icsToken!;
  }

  /** Finds the calendar by its ICS token (public, no auth required). */
  async findByIcsToken(token: string): Promise<Calendar | null> {
    return this.calendarsRepo.findOne({
      where: { icsToken: token },
      relations: ['organization'],
    });
  }

  /** Rotates the ICS token (invalidates old subscription URLs). */
  async rotateIcsToken(organizationId: number): Promise<string> {
    const cal = await this.calendarsRepo.findOne({ where: { organization: { id: organizationId } } });
    if (!cal) throw new Error('Calendar not found');
    cal.icsToken = require('crypto').randomBytes(24).toString('hex');
    await this.calendarsRepo.save(cal);
    return cal.icsToken!;
  }

  /**
   * Parses an ICS file and bulk-imports VEVENT records into the org's calendar.
   * Deduplicates by UID — events already present (same UID) are skipped.
   * Returns a summary of { imported, skipped, errors }.
   */
  async importIcs(
    organizationId: number,
    userId: number,
    icsContent: string,
  ): Promise<{ imported: number; skipped: number; errors: string[] }> {
    const calendar = await this.getOrCreateOrgCalendar(organizationId, userId);
    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    // Parse ICS blocks
    const events = this.parseIcsEvents(icsContent);

    for (const ev of events) {
      if (!ev.summary || !ev.startAt) {
        skipped++;
        continue;
      }

      // Dedup by external UID stored in technicalRequirements field
      if (ev.uid) {
        const exists = await this.eventsRepo.findOne({
          where: { calendar: { id: calendar.id }, technicalRequirements: `ics-uid:${ev.uid}` },
        });
        if (exists) { skipped++; continue; }
      }

      try {
        await this.eventsRepo.save(this.eventsRepo.create({
          calendar,
          type: CalendarEventType.EVENT,
          title: ev.summary,
          description: ev.description,
          location: ev.location,
          startAt: ev.startAt,
          endAt: ev.endAt ?? new Date(ev.startAt.getTime() + 3600000),
          allDay: ev.allDay ?? false,
          technicalRequirements: ev.uid ? `ics-uid:${ev.uid}` : undefined,
          createdBy: { id: userId } as any,
        }));
        imported++;
      } catch (e: any) {
        errors.push(`${ev.summary}: ${e.message}`);
      }
    }

    return { imported, skipped, errors };
  }

  private parseIcsEvents(ics: string): Array<{
    uid?: string; summary?: string; description?: string;
    location?: string; startAt?: Date; endAt?: Date; allDay?: boolean;
  }> {
    const events: ReturnType<typeof this.parseIcsEvents> = [];
    const blocks = ics.split('BEGIN:VEVENT');

    for (const block of blocks.slice(1)) {
      const end = block.indexOf('END:VEVENT');
      if (end < 0) continue;
      const raw = block.substring(0, end);

      // RFC 5545 line unfolding: \r\n followed by space or tab
      const unfolded = raw.replace(/\r?\n[ \t]/g, '');
      const lines = unfolded.split(/\r?\n/).filter(Boolean);

      // Get value by property name (handles both PROP:val and PROP;PARAM=x:val)
      const getPropValue = (name: string): string | undefined => {
        const line = lines.find(l =>
          l.toUpperCase().startsWith(name.toUpperCase() + ':') ||
          l.toUpperCase().startsWith(name.toUpperCase() + ';')
        );
        if (!line) return undefined;
        const colonIdx = line.indexOf(':');
        const val = line.substring(colonIdx + 1);
        return val
          .replace(/\\n/g, '\n').replace(/\\N/g, '\n')
          .replace(/\\,/g, ',').replace(/\\;/g, ';')
          .replace(/\\\\/g, '\\');
      };

      // Get full property line (including params like TZID)
      const getPropLine = (name: string): string | undefined =>
        lines.find(l =>
          l.toUpperCase().startsWith(name.toUpperCase() + ':') ||
          l.toUpperCase().startsWith(name.toUpperCase() + ';')
        );

      /**
       * Parse ICS datetime string into a Date.
       * Handles:
       *   - 20240101T090000Z      → UTC
       *   - 20240101T090000       → treat as local (Israel = UTC+3, add offset)
       *   - 20240101              → all-day, use noon UTC to avoid date boundary shift
       * TZID parameter is extracted from the property line for context but we
       * approximate non-UTC times as UTC+0 (server side); the calendar
       * displays in server timezone anyway.
       */
      const parseIcsDt = (propLine?: string): { date: Date; allDay: boolean } | undefined => {
        if (!propLine) return undefined;
        const colonIdx = propLine.indexOf(':');
        const params = propLine.substring(0, colonIdx).toUpperCase();
        const value  = propLine.substring(colonIdx + 1).trim();

        // All-day: VALUE=DATE or 8-char date-only value
        if (params.includes('VALUE=DATE') || /^\d{8}$/.test(value)) {
          const y = value.slice(0, 4), m = value.slice(4, 6), d = value.slice(6, 8);
          // Use noon UTC so the date is correct in any timezone (UTC±12)
          return { date: new Date(`${y}-${m}-${d}T12:00:00.000Z`), allDay: true };
        }

        // Date-time with Z suffix → UTC
        if (value.endsWith('Z')) {
          const iso = value.replace(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
            '$1-$2-$3T$4:$5:$6.000Z'
          );
          return { date: new Date(iso), allDay: false };
        }

        // Date-time without Z (floating or TZID-qualified)
        // We treat it as UTC — good enough for display purposes
        const iso = value.replace(
          /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/,
          '$1-$2-$3T$4:$5:$6.000Z'
        );
        return { date: new Date(iso), allDay: false };
      };

      const startProp = parseIcsDt(getPropLine('DTSTART'));
      const endProp   = parseIcsDt(getPropLine('DTEND')) ??
                        parseIcsDt(getPropLine('DURATION')); // fallback

      if (!startProp) continue;

      events.push({
        uid:         getPropValue('UID'),
        summary:     getPropValue('SUMMARY'),
        description: getPropValue('DESCRIPTION'),
        location:    getPropValue('LOCATION'),
        startAt:     startProp.date,
        endAt:       endProp?.date ?? new Date(startProp.date.getTime() + 3600000),
        allDay:      startProp.allDay,
      });
    }
    return events;
  }

  async getOrCreateOrgCalendar(organizationId: number, userId: number): Promise<Calendar> {
    let calendar = await this.calendarsRepo.findOne({
      where: { organization: { id: organizationId } },
    });
    if (!calendar) {
      calendar = await this.calendarsRepo.save(
        this.calendarsRepo.create({
          name: 'Shared Calendar',
          organization: { id: organizationId } as any,
          createdBy: { id: userId } as any,
        }),
      );
    }
    return calendar;
  }

  async findCalendar(organizationId: number): Promise<Calendar | null> {
    return this.calendarsRepo.findOne({ where: { organization: { id: organizationId } } });
  }

  // ----- Events -----

  /** Lists events for a date range (for calendar rendering). */
  async listEvents(
    organizationId: number,
    from: Date,
    to: Date,
  ): Promise<CalendarEvent[]> {
    const calendar = await this.findCalendar(organizationId);
    if (!calendar) return [];
    return this.eventsRepo.find({
      where: { calendar: { id: calendar.id }, startAt: Between(from, to) },
      relations: ['createdBy', 'attachments'],
      order: { startAt: 'ASC' },
    });
  }

  async findEvent(id: number, organizationId: number): Promise<CalendarEvent> {
    const event = await this.eventsRepo.findOne({
      where: { id },
      relations: ['calendar', 'calendar.organization', 'createdBy', 'attachments', 'attachments.storageConnection'],
    });
    if (!event || event.calendar?.organization?.id !== organizationId) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }

  async createEvent(organizationId: number, userId: number, dto: CreateEventDto): Promise<CalendarEvent> {
    const calendar = await this.getOrCreateOrgCalendar(organizationId, userId);
    const event = await this.eventsRepo.save(
      this.eventsRepo.create({
        calendar,
        type: dto.type,
        title: dto.title,
        description: dto.description,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : undefined,
        allDay: dto.allDay ?? false,
        location: dto.location,
        color: dto.color,
        repeat: dto.repeat,
        technicalRequirements: dto.technicalRequirements,
        requiredEquipment: dto.requiredEquipment,
        createdBy: { id: userId } as any,
      }),
    );
    return this.findEvent(event.id, organizationId);
  }

  async updateEvent(id: number, organizationId: number, dto: UpdateEventDto): Promise<CalendarEvent> {
    const event = await this.findEvent(id, organizationId);
    Object.assign(event, {
      type: dto.type ?? event.type,
      title: dto.title ?? event.title,
      description: dto.description ?? event.description,
      startAt: dto.startAt ? new Date(dto.startAt) : event.startAt,
      endAt: dto.endAt ? new Date(dto.endAt) : event.endAt,
      allDay: dto.allDay ?? event.allDay,
      done: dto.done ?? event.done,
      location: dto.location ?? event.location,
      color: dto.color ?? event.color,
      repeat: dto.repeat ?? event.repeat,
      technicalRequirements: dto.technicalRequirements ?? event.technicalRequirements,
      requiredEquipment: dto.requiredEquipment ?? event.requiredEquipment,
    });
    await this.eventsRepo.save(event);
    return this.findEvent(id, organizationId);
  }

  async removeEvent(id: number, organizationId: number): Promise<void> {
    const event = await this.findEvent(id, organizationId);
    await this.eventsRepo.remove(event);
  }

  // ----- Attachments -----

  async addAttachment(
    eventId: number,
    organizationId: number,
    userId: number,
    file: { originalname: string; buffer: Buffer; mimetype: string },
  ): Promise<CalendarAttachment> {
    const event = await this.findEvent(eventId, organizationId);
    const settings = await this.storageService.getClientSettings(userId);
    const connectionId = settings?.documentStorageConnection?.id;

    const attachment = this.attachmentsRepo.create({
      event,
      originalName: file.originalname,
      mimetype: file.mimetype,
      uploadedBy: { id: userId } as any,
    });

    if (connectionId) {
      const { adapter, encryptAtRest } = await this.storageService.getAdapterWithMeta(connectionId);
      const isPhoto = file.mimetype.startsWith('image/');
      let toWrite = isPhoto ? await processPhoto(file.buffer) : file.buffer;
      if (encryptAtRest) toWrite = encryptBuffer(toWrite);
      const ext = file.originalname.split('.').pop() ?? 'bin';
      const path = `Calendar/${eventId}/${Date.now()}.${ext}`;
      await adapter.write(path, toWrite);
      attachment.relativePath = path;
      attachment.encrypted = encryptAtRest;
      attachment.storageConnection = { id: connectionId } as any;
    }

    return this.attachmentsRepo.save(attachment);
  }

  async downloadAttachment(
    attachmentId: number,
    organizationId: number,
  ): Promise<{ buffer: Buffer; originalName: string; mimetype: string }> {
    const attachment = await this.attachmentsRepo.findOne({
      where: { id: attachmentId },
      relations: ['event', 'event.calendar', 'event.calendar.organization', 'storageConnection'],
    });
    if (!attachment || attachment.event?.calendar?.organization?.id !== organizationId) {
      throw new NotFoundException('Attachment not found');
    }
    if (!attachment.relativePath || !attachment.storageConnection) {
      throw new NotFoundException('File not stored on backend');
    }
    const { decryptBuffer } = await import('../../common/crypto/encryption.util');
    const adapter = await this.storageService.getAdapter(attachment.storageConnection.id);
    let bytes = await adapter.read(attachment.relativePath);
    if (attachment.encrypted) bytes = decryptBuffer(bytes);
    return { buffer: bytes, originalName: attachment.originalName, mimetype: attachment.mimetype ?? 'application/octet-stream' };
  }

  async removeAttachment(attachmentId: number, organizationId: number): Promise<void> {
    const attachment = await this.attachmentsRepo.findOne({
      where: { id: attachmentId },
      relations: ['event', 'event.calendar', 'event.calendar.organization'],
    });
    if (!attachment || attachment.event?.calendar?.organization?.id !== organizationId) {
      throw new NotFoundException('Attachment not found');
    }
    await this.attachmentsRepo.remove(attachment);
  }
}
