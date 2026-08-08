import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * Per-organization settings for automated overdue-invoice reminder
 * emails. `thresholdDays` is a list (e.g. [7, 14, 30]) — a reminder
 * fires once per invoice PER threshold crossed, not daily, so a
 * client doesn't get spammed every single day their bill sits unpaid
 * — see OverdueReminderService.checkAndSend for exactly how a
 * threshold-crossing gets detected and never re-sent for the same
 * invoice+threshold pair (OverdueReminderLog is what remembers that).
 */
@Entity('overdue_reminder_settings')
export class OverdueReminderSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'int', array: true, default: () => "'{7,14,30}'" })
  thresholdDays: number[];

  @Column({ type: 'text', nullable: true })
  messageTemplate?: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
