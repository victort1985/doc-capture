import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Calendar } from './entities/calendar.entity';
import { CalendarEvent } from './entities/calendar-event.entity';
import { CalendarAttachment } from './entities/calendar-attachment.entity';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { IcsController } from './ics.controller';
import { StorageModule } from '../storage/storage.module';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarController } from './google-calendar.controller';
import { GoogleCalendarCron } from './google-calendar.cron';
import { Organization } from '../organizations/entities/organization.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Calendar, CalendarEvent, CalendarAttachment, Organization]), StorageModule],
  controllers: [CalendarController, IcsController, GoogleCalendarController],
  providers: [CalendarService, GoogleCalendarService, GoogleCalendarCron],
  exports: [CalendarService],
})
export class CalendarModule {}
