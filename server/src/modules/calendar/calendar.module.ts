import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Calendar } from './entities/calendar.entity';
import { CalendarEvent } from './entities/calendar-event.entity';
import { CalendarAttachment } from './entities/calendar-attachment.entity';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([Calendar, CalendarEvent, CalendarAttachment]), StorageModule],
  controllers: [CalendarController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
