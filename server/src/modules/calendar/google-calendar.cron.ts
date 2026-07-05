import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GoogleCalendarService } from './google-calendar.service';

@Injectable()
export class GoogleCalendarCron {
  private readonly logger = new Logger('GoogleCalendarCron');

  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  /** Every 10 minutes — Google → Vixor one-way sync for every connected
   * organization calendar. Cheap: uses Google's incremental sync tokens,
   * so most runs fetch nothing at all if nothing changed. */
  @Cron('*/10 * * * *')
  async handleCron() {
    this.logger.log('Running scheduled Google Calendar sync…');
    await this.googleCalendarService.syncAllConnected();
  }
}
