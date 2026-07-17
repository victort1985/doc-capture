import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../organizations/entities/organization.entity';
import { User } from '../users/entities/user.entity';

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
  CANCELLED = 'cancelled',
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
}

/**
 * A billing document — "office.invoices" gate. This is basic
 * record-keeping (create, send, mark paid by hand) with no payment
 * gateway wired in yet: "paid" is set manually by an admin, not by an
 * actual payment being collected. It is NOT a certified Israeli tax
 * invoice (חשבונית מס) — sequential numbering here is per-organization
 * insertion order, not the compliance-grade numbering the tax
 * authority requires. Confirm with an accountant before relying on
 * this as the official invoicing system; a real payment
 * processor (Tranzila/Cardcom/Stripe/etc.) is a separate integration
 * decision, not yet made.
 */
@Entity('invoices')
export class Invoice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  invoiceNumber?: string;

  @Column({ type: 'date', nullable: true })
  date?: string;

  @Column()
  clientName: string;

  @Column({ nullable: true })
  clientEmail?: string;

  @Column({ type: 'jsonb', default: [] })
  items: InvoiceItem[];

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date;

  /** Optional link back to the quote this invoice was raised from. */
  @Column({ nullable: true })
  quoteId?: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
