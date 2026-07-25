import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

/**
 * A credit note (זיכוי) — the ONLY legal way to correct or void an
 * issued invoice under Israeli tax law. Never edits or deletes the
 * original invoice; it's its own numbered fiscal document that
 * references one, with a total that reduces (or fully reverses) what
 * the original invoice billed. See InvoicesService.remove() for why
 * invoices themselves can't be deleted at all.
 */
@Entity('credit_notes')
export class CreditNote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  creditNoteNumber?: string;

  @Column({ type: 'date', nullable: true })
  date?: string;

  @Column()
  clientName: string;

  @Column({ nullable: true })
  clientEmail?: string;

  /** The invoice this credit note corrects. Required — a credit note
   * with no original invoice isn't a correction of anything, it's
   * just an invoice with the wrong sign, which isn't a real category
   * under Israeli tax law. */
  @Column()
  @Index()
  invoiceId: number;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'jsonb', default: [] })
  items: { description: string; quantity: number; unitPrice: number }[];

  /** Always positive — this is the amount being credited back, not a
   * negative invoice total. Whether it equals the full original
   * invoice (a full void) or less (a partial correction) is up to
   * what's actually being corrected. */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  total: number;

  @Column({ type: 'varchar', nullable: true })
  storagePath?: string | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  chainId?: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
