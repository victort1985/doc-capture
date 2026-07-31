import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';
import { PaymentMethod } from '../../payments/entities/payment.entity';

/**
 * A direct expense (requirement #13 — "расходы") — paid immediately
 * from cash or bank, not owed to anyone the way a SupplierInvoice is.
 * E.g. petty cash purchases, small recurring costs, anything that
 * doesn't warrant tracking as a payable first.
 */
@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column()
  description: string;

  @Column({ nullable: true })
  category?: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  /** Reuses Payment's own PaymentMethod enum + method-specific column
   * set below rather than a separate, narrower cash/bank-only type —
   * money leaving the business has the same real payment methods as
   * money coming in (card/check/Bit/standing order), not a smaller
   * set just because this module was built first with only two. */
  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  method: PaymentMethod;

  /** credit_card */
  @Column({ type: 'varchar', nullable: true })
  cardLast4?: string | null;

  /** credit_card */
  @Column({ type: 'varchar', nullable: true })
  cardType?: string | null;

  /** credit_card — terminal approval number */
  @Column({ type: 'varchar', nullable: true })
  approvalNumber?: string | null;

  /** credit_card — installments (תשלומים), 1 if not split */
  @Column({ type: 'integer', nullable: true })
  installments?: number | null;

  /** check */
  @Column({ type: 'varchar', nullable: true })
  checkNumber?: string | null;

  /** check, bank_transfer */
  @Column({ type: 'varchar', nullable: true })
  bankName?: string | null;

  /** check — bank branch number (סניף) */
  @Column({ type: 'varchar', nullable: true })
  branchNumber?: string | null;

  /** check — account the check is drawn on */
  @Column({ type: 'varchar', nullable: true })
  accountNumber?: string | null;

  /** check — date written on the check, may be postdated */
  @Column({ type: 'date', nullable: true })
  checkDate?: string | null;

  /** bank_transfer, bit, standing_order — confirmation/reference number */
  @Column({ type: 'varchar', nullable: true })
  referenceNumber?: string | null;

  @Column({ type: 'varchar', nullable: true })
  receiptStoragePath?: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @Index()
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true })
  createdBy?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
