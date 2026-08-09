import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { CostCenter } from '../../cost-centers/entities/cost-center.entity';

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

  /** ח.פ./עוסק מורשה number — required for requirement #6 ("Invoice
   * Israel") when the client needs to claim input VAT on this
   * invoice, per the spec's note that number_vat_customer is
   * "required when required by law" rather than unconditionally.
   * Not required for B2C sales to individual consumers. */
  @Column({ nullable: true })
  clientTaxId?: string;

  /** requirement #19 ("мультивалюта") + VAT category (standard 18%/
   * zero-rated export/exempt — requirement #5's multi-rate gap).
   * `total` below always stays denominated in `currency`; ledger
   * postings and the Tax Authority allocation request both convert
   * to ILS themselves using exchangeRateToIls at post time, rather
   * than storing a second pre-converted total column that could
   * drift out of sync with it. */
  @Column({ type: 'varchar', default: 'ILS' })
  currency: string;

  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true, transformer: numericTransformer })
  exchangeRateToIls?: number | null;

  @Column({ type: 'varchar', default: 'standard' })
  vatCategory: 'standard' | 'zero' | 'exempt';

  @Column({ type: 'jsonb', default: [] })
  items: InvoiceItem[];

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  total: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** See CostCenter's own doc comment. */
  @ManyToOne(() => CostCenter, { nullable: true, onDelete: 'SET NULL' })
  costCenter?: CostCenter | null;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT })
  status: InvoiceStatus;

  @Column({ type: 'timestamp', nullable: true })
  paidAt?: Date;

  /** requirement #6, "Invoice Israel" — the confirmation_number
   * returned by the ITA's Approval API, printed on the invoice per
   * the spec's instructions (rightmost 9 digits, under "הקצאה מספר:").
   * Null means either this invoice was under the reporting threshold,
   * the integration isn't enabled for this org, or the request hasn't
   * been made/hasn't succeeded yet — allocationStatus distinguishes
   * these cases. */
  @Column({ type: 'varchar', nullable: true })
  allocationNumber?: string | null;

  @Column({ type: 'enum', enum: ['not_applicable', 'pending', 'approved', 'refused', 'error'], default: 'not_applicable' })
  allocationStatus: 'not_applicable' | 'pending' | 'approved' | 'refused' | 'error';

  /** Which of the 4 alternatives (see requirement #6's "עיכוב חשבונית")
   * was chosen when a request came back refused — cancel/continue/
   * reverse-charge/hearing-request. Null until a decision is made. */
  @Column({ type: 'varchar', nullable: true })
  allocationDecision?: string | null;

  /** Relative path (within the configured storage connection) to the
   * generated PDF, set once at creation. Null if no storage
   * connection is configured for the org yet. */
  @Column({ type: 'varchar', nullable: true })
  storagePath?: string | null;

  /** See Quote.chainId — same order-processing chain concept. */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  chainId?: string | null;

  /** Optional link back to the quote this invoice was raised from. */
  @Column({ nullable: true })
  quoteId?: number;

  /** Optional link back to the delivery note this invoice was raised
   * from — same chain-inheritance idea as quoteId. */
  @Column({ nullable: true })
  deliveryNoteId?: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
