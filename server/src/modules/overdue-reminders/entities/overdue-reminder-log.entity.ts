import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Invoice } from '../../invoices/entities/invoice.entity';

/** One row per invoice+threshold reminder actually sent — see
 * OverdueReminderSettings' own doc comment for why this exists (never
 * re-send the same threshold twice for the same invoice). */
@Entity('overdue_reminder_logs')
@Index(['invoice', 'thresholdDays'], { unique: true })
export class OverdueReminderLog {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Invoice, { onDelete: 'CASCADE' })
  invoice: Invoice;

  @Column({ type: 'int' })
  thresholdDays: number;

  @Column({ type: 'boolean', default: false })
  sentSuccessfully: boolean;

  @CreateDateColumn()
  sentAt: Date;
}
