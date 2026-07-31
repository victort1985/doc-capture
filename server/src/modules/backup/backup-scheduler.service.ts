import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { BackupSchedule, BackupFrequency } from './entities/backup-schedule.entity';
import { BackupService } from './backup.service';

export class UpdateBackupScheduleDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsEnum(BackupFrequency)
  @IsOptional()
  frequency?: BackupFrequency;

  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  intervalHours?: number;

  @IsString()
  @IsOptional()
  timeOfDay?: string;

  @IsInt()
  @Min(0)
  @Max(6)
  @IsOptional()
  dayOfWeek?: number | null;

  @IsInt()
  @Min(1)
  @Max(31)
  @IsOptional()
  dayOfMonth?: number | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  retentionCount?: number;
}

/**
 * Ticks every 5 minutes and decides, based on the one BackupSchedule
 * row for this instance, whether it's time to run a backup —
 * checking against a 5-minute tolerance window (matching the tick
 * interval) rather than requiring an exact-second match, since a cron
 * tick and a person's chosen "14:30" won't necessarily land on the
 * exact same second.
 */
@Injectable()
export class BackupSchedulerService {
  private readonly logger = new Logger(BackupSchedulerService.name);

  constructor(
    @InjectRepository(BackupSchedule) private readonly repo: Repository<BackupSchedule>,
    private readonly backupService: BackupService,
  ) {}

  async getOrCreate(): Promise<BackupSchedule> {
    let schedule = await this.repo.findOne({ where: {} });
    if (!schedule) {
      schedule = await this.repo.save(this.repo.create({}));
    }
    return schedule;
  }

  async update(dto: UpdateBackupScheduleDto): Promise<BackupSchedule> {
    const schedule = await this.getOrCreate();
    if (dto.enabled !== undefined) schedule.enabled = dto.enabled;
    if (dto.frequency !== undefined) schedule.frequency = dto.frequency;
    if (dto.intervalHours !== undefined) schedule.intervalHours = dto.intervalHours;
    if (dto.timeOfDay !== undefined) schedule.timeOfDay = dto.timeOfDay;
    if (dto.dayOfWeek !== undefined) schedule.dayOfWeek = dto.dayOfWeek;
    if (dto.dayOfMonth !== undefined) schedule.dayOfMonth = dto.dayOfMonth;
    if (dto.retentionCount !== undefined) schedule.retentionCount = dto.retentionCount;
    return this.repo.save(schedule);
  }

  @Cron('*/5 * * * *')
  async checkAndRun(): Promise<void> {
    const schedule = await this.repo.findOne({ where: {} });
    if (!schedule?.enabled) return;

    if (!this.isDue(schedule, new Date())) return;

    this.logger.log(`Scheduled backup is due (frequency=${schedule.frequency}) — running now`);
    try {
      await this.backupService.createNow('scheduled');
      schedule.lastRunAt = new Date();
      schedule.lastRunError = null;
      await this.repo.save(schedule);
      await this.backupService.pruneScheduled(schedule.retentionCount);
    } catch (err) {
      this.logger.error(`Scheduled backup failed: ${(err as Error).message}`);
      schedule.lastRunAt = new Date();
      schedule.lastRunError = (err as Error).message.slice(0, 500);
      await this.repo.save(schedule);
    }
  }

  /** Pure function (no I/O) so this is easy to reason about in
   * isolation: given the schedule config and "now", should a backup
   * run this tick? */
  private isDue(schedule: BackupSchedule, now: Date): boolean {
    const last = schedule.lastRunAt ? new Date(schedule.lastRunAt) : null;

    if (schedule.frequency === BackupFrequency.HOURLY) {
      const intervalMs = Math.max(1, schedule.intervalHours) * 60 * 60 * 1000;
      if (!last) return true;
      return now.getTime() - last.getTime() >= intervalMs;
    }

    // DAILY/WEEKLY/MONTHLY all gate on "are we within 5 minutes of the
    // configured time of day right now", then add their own extra
    // condition on top.
    const [hh, mm] = (schedule.timeOfDay || '03:00').split(':').map((n) => parseInt(n, 10));
    const scheduledMinutes = (hh || 0) * 60 + (mm || 0);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const withinTimeWindow = Math.abs(nowMinutes - scheduledMinutes) < 5;
    if (!withinTimeWindow) return false;

    // Never run twice within the same period even if the tick lands
    // in the window more than once (e.g. two ticks 5 minutes apart
    // both matching a wide-enough window) — gate on "last run wasn't
    // already in this period".
    if (schedule.frequency === BackupFrequency.DAILY) {
      if (last && this.isSameDay(last, now)) return false;
      return true;
    }

    if (schedule.frequency === BackupFrequency.WEEKLY) {
      if (schedule.dayOfWeek == null || now.getDay() !== schedule.dayOfWeek) return false;
      if (last && this.isSameDay(last, now)) return false;
      return true;
    }

    if (schedule.frequency === BackupFrequency.MONTHLY) {
      const targetDay = this.clampDayOfMonth(schedule.dayOfMonth ?? 1, now);
      if (now.getDate() !== targetDay) return false;
      if (last && this.isSameDay(last, now)) return false;
      return true;
    }

    return false;
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  /** A dayOfMonth of 31 (or 30, or 29) doesn't exist in every month —
   * clamps to that month's actual last day instead of silently never
   * running in February, April, etc. */
  private clampDayOfMonth(day: number, now: Date): number {
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return Math.min(day, lastDayOfMonth);
  }
}
