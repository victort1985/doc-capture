import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

export enum PaymentMethod {
  CASH = 'cash',
  CREDIT_CARD = 'credit_card',
  BANK_TRANSFER = 'bank_transfer',
  CHECK = 'check',
  BIT = 'bit',
  STANDING_ORDER = 'standing_order',
}

/**
 * A payment record — the final link in the order-processing chain
 * (quote -> order -> delivery note -> invoice -> payment). This is a
 * SIMULATOR: no real payment gateway is wired in. Recording a payment
 * here does not move real money and does not integrate with any
 * processor (Tranzila/Cardcom/Stripe/etc.) - that is a separate,
 * not-yet-made integration decision. It exists so the chain has a
 * concrete, document-backed "this order is fully closed out" signal,
 * matching how quotes/invoices/delivery-notes already work.
 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  paymentNumber?: string;

  @Column({ type: 'date', nullable: true })
  date?: string;

  @Column()
  clientName: string;

  @Column({ nullable: true })
  clientEmail?: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  method: PaymentMethod;

  // ---- Method-specific fields — all optional, only the ones relevant
  // to the chosen `method` are meaningfully filled in. Kept as plain
  // nullable columns rather than a JSON blob so they stay queryable/
  // reportable (e.g. "find all payments by check number").

  /** credit_card */
  @Column({ type: 'varchar', nullable: true })
  cardLast4?: string | null;

  /** credit_card — 'visa' | 'mastercard' | 'isracard' | 'amex' | 'diners' | other free text */
  @Column({ type: 'varchar', nullable: true })
  cardType?: string | null;

  /** credit_card — אישור/approval number from the terminal */
  @Column({ type: 'varchar', nullable: true })
  approvalNumber?: string | null;

  /** credit_card — number of installments (תשלומים), 1 if not split */
  @Column({ type: 'integer', nullable: true })
  installments?: number | null;

  /** check — צ'ק number */
  @Column({ type: 'varchar', nullable: true })
  checkNumber?: string | null;

  /** check, bank_transfer — bank name */
  @Column({ type: 'varchar', nullable: true })
  bankName?: string | null;

  /** check — bank branch number (סניף) */
  @Column({ type: 'varchar', nullable: true })
  branchNumber?: string | null;

  /** check — account number the check is drawn on */
  @Column({ type: 'varchar', nullable: true })
  accountNumber?: string | null;

  /** check — the date written on the check, which may be postdated
   * (צ'ק דחוי) relative to the payment's own `date`. */
  @Column({ type: 'date', nullable: true })
  checkDate?: string | null;

  /** bank_transfer, bit, standing_order — confirmation/reference number */
  @Column({ type: 'varchar', nullable: true })
  referenceNumber?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** Relative path (within the configured storage connection) to the
   * generated receipt PDF, set once at creation. Null if no storage
   * connection is configured for the org yet. */
  @Column({ type: 'varchar', nullable: true })
  storagePath?: string | null;

  /** Set once, at creation, when the original receipt PDF is first
   * generated — this is "the original was printed/sent" per the
   * business rule that the original only ever goes out once. Any
   * later access to this payment's PDF is a reprint; the UI offers an
   * explicit "print as certified copy" (נאמן למקור) option for that
   * case, but nothing here forces it — see PaymentsService.getPdfBuffer. */
  @Column({ type: 'timestamp', nullable: true })
  originalIssuedAt?: Date | null;

  /** Path (within the org's Payment storage connection) to the
   * combined PDF of every document in this chain — generated once,
   * automatically, right after this payment completes the chain. Null
   * until that generation succeeds (or if it never runs, e.g. no
   * storage configured). */
  @Column({ type: 'varchar', nullable: true })
  chainSummaryPath?: string | null;

  /** See Quote.chainId — same order-processing chain concept. Payment
   * is the last link: a chain with a Payment in it is what "complete"
   * means throughout the order-chain module. */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  chainId?: string | null;

  /** Link back to the invoice this payment settles. */
  @Column({ nullable: true })
  invoiceId?: number;

  /** Inherited from the linked invoice when there is one (same
   * reasoning as CreditNote/DebitNote — a payment settling an
   * invoice should reflect that invoice's currency/VAT treatment,
   * not something chosen independently). Defaults to ILS/standard
   * for a standalone payment with no invoiceId. */
  @Column({ type: 'varchar', default: 'ILS' })
  currency: string;

  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true, transformer: numericTransformer })
  exchangeRateToIls?: number | null;

  @Column({ type: 'varchar', default: 'standard' })
  vatCategory: 'standard' | 'zero' | 'exempt';

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
