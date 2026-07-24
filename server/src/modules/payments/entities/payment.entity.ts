import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

export enum PaymentMethod {
  CARD = 'card',
  CASH = 'cash',
  TRANSFER = 'transfer',
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

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CARD })
  method: PaymentMethod;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** Relative path (within the configured storage connection) to the
   * generated receipt PDF, set once at creation. Null if no storage
   * connection is configured for the org yet. */
  @Column({ type: 'varchar', nullable: true })
  storagePath?: string | null;

  /** See Quote.chainId — same order-processing chain concept. Payment
   * is the last link: a chain with a Payment in it is what "complete"
   * means throughout the order-chain module. */
  @Column({ type: 'uuid', nullable: true })
  @Index()
  chainId?: string | null;

  /** Link back to the invoice this payment settles. */
  @Column({ nullable: true })
  invoiceId?: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
