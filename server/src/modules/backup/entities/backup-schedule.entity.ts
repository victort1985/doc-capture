import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum BackupFrequency {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

/**
 * A single row per running instance (this is a database-per-tenant
 * architecture — see BackupService — so there's exactly one schedule
 * to configure per process, not one per organization). Checked every
 * 5 minutes by BackupSchedulerService; the fields actually consulted
 * depend on `frequency` — e.g. dayOfWeek is only meaningful for
 * WEEKLY, ignored otherwise.
 */
@Entity('backup_schedule')
export class BackupSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'enum', enum: BackupFrequency, default: BackupFrequency.DAILY })
  frequency: BackupFrequency;

  /** HOURLY only — every N hours (1, 2, 3, 6, 12...). */
  @Column({ type: 'integer', default: 1 })
  intervalHours: number;

  /** DAILY/WEEKLY/MONTHLY — 'HH:mm', local server time. */
  @Column({ type: 'varchar', default: '03:00' })
  timeOfDay: string;

  /** WEEKLY only — 0 (Sunday) through 6 (Saturday). */
  @Column({ type: 'integer', nullable: true })
  dayOfWeek: number | null;

  /** MONTHLY only — 1 through 31 (clamped to the last real day of
   * shorter months when it doesn't exist — e.g. 31 in February runs
   * on the 28th/29th instead of being skipped entirely). */
  @Column({ type: 'integer', nullable: true })
  dayOfMonth: number | null;

  /** How many scheduled backups to keep before deleting the oldest —
   * separate from on-demand ones a person created manually via
   * "Create now", which this never auto-deletes. 0 means unlimited. */
  @Column({ type: 'integer', default: 14 })
  retentionCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  lastRunError: string | null;

  @UpdateDateColumn()
  updatedAt: Date;
}
