import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TimeThresholdSettings } from './entities/time-threshold-settings.entity';
import { TimeThresholdsService } from './time-thresholds.service';
import { TimeThresholdsController } from './time-thresholds.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TimeThresholdSettings])],
  providers: [TimeThresholdsService],
  controllers: [TimeThresholdsController],
  exports: [TimeThresholdsService],
})
export class TimeThresholdsModule {}
