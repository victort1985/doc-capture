import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { CalendarService } from './calendar.service';

/**
 * Public ICS feed controller — NO authentication.
 * The secret icsToken in the URL acts as authentication.
 * Google Calendar / Apple Calendar / Outlook can subscribe to:
 *   https://app.doc-capture.app/api/ics/:token
 */
@Controller('ics')
export class IcsController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get(':token')
  async feed(@Param('token') token: string, @Res() res: Response) {
    const calendar = await this.calendarService.findByIcsToken(token);
    if (!calendar) { res.status(404).send('Not found'); return; }

    const from = new Date(Date.now() - 90 * 86400000);
    const to   = new Date(Date.now() + 365 * 86400000);
    const events = await this.calendarService.listEvents(calendar.organization!.id, from, to);

    const esc = (s: string) =>
      s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');
    const orgName = calendar.organization?.name ?? 'Vixor ERP';

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Vixor ERP//Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      `X-WR-CALNAME:${esc(orgName)}`,
      'X-WR-TIMEZONE:Asia/Jerusalem',
    ];

    for (const e of events) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:vixor-${e.id}@vixor-erp`);
      lines.push(`DTSTAMP:${fmt(new Date())}`);
      lines.push(`DTSTART:${fmt(e.startAt instanceof Date ? e.startAt : new Date(e.startAt))}`);
      lines.push(`DTEND:${fmt(e.endAt instanceof Date ? e.endAt : new Date(String(e.endAt ?? e.startAt)))}`);
      lines.push(`SUMMARY:${esc(e.title)}`);
      if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
      if (e.location)    lines.push(`LOCATION:${esc(e.location)}`);
      lines.push(`STATUS:${e.type === "task" ? "VTODO" : "CONFIRMED"}`);
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${orgName.replace(/\s/g,'-')}.ics"`);
    res.setHeader('Cache-Control', 'no-cache, no-store');
    res.send(lines.join('\r\n'));
  }
}
