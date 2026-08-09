import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeClockEntry } from './entities/time-clock-entry.entity';
import { TimeClockService } from './time-clock.service';
import { TimeClockController } from './time-clock.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TimeClockEntry])],
  controllers: [TimeClockController],
  providers: [TimeClockService],
})
export class TimeClockModule {}
