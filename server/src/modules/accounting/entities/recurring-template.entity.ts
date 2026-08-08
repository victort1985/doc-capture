import {
  Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

export enum RecurringDocumentType {
  EXPENSE = 'expense',
  INVOICE = 'invoice',
}

/**
 * A template for a document that gets auto-generated on the same day
 * every month — rent, subscriptions, salary, retainer billing to a
 * client (הוראת קבע). `templateData` holds exactly the same shape
 * the corresponding create-DTO expects (CreateExpenseDto or
 * CreateInvoiceDto), so generating the actual document each run is
 * just "call the same service method a person clicking Create would
 * have" rather than a second, parallel creation path to keep in sync
 * — see RecurringDocumentsService.runDue().
 */
@Entity('recurring_templates')
export class RecurringTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'enum', enum: RecurringDocumentType })
  documentType: RecurringDocumentType;

  /** 1-28 — deliberately capped below 29 so "the 30th" or "the 31st"
   * never silently skips or jumps in short months; a person picking a
   * day this late in the month for a RECURRING template is almost
   * certainly thinking "end of month" anyway, better served by
   * picking a day everyone actually understands the same way. */
  @Column({ type: 'int' })
  dayOfMonth: number;

  /** Raw JSON body matching CreateExpenseDto/CreateInvoiceDto exactly
   * for the chosen documentType — see this entity's own class
   * comment for why. */
  @Column({ type: 'jsonb' })
  templateData: Record<string, unknown>;

  @Column({ type: 'date' })
  nextRunDate: string;

  @Column({ type: 'date', nullable: true })
  lastRunDate?: string | null;

  @Column({ type: 'boolean', default: true })
  @Index()
  active: boolean;

  /** Every document this template has ever generated, most recent
   * first — id + the date it was created, so the admin panel can show
   * "last 5 generated" without a separate join back through Expense/
   * Invoice (which don't carry a reference back to the template that
   * created them, keeping this one-directional and simple). */
  @Column({ type: 'jsonb', default: [] })
  generatedLog: { documentId: number; date: string }[];

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @Index()
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
