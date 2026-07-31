import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupController } from './backup.controller';
import { BackupSchedule } from './entities/backup-schedule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([BackupSchedule])],
  controllers: [BackupController],
  providers: [BackupService, BackupSchedulerService],
})
export class BackupModule {}
