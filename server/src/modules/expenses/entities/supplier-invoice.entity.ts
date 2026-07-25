import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

/**
 * An incoming bill from a supplier (requirement #9/#13 — "покупки").
 * Recorded as owed the moment it's entered (posts to Accounts
 * Payable), independent of when it actually gets paid — paidAt tracks
 * that separately rather than deleting/replacing the record, the same
 * "never quietly rewrite history" principle as every other document
 * type in this system.
 */
@Entity('supplier_invoices')
export class SupplierInvoice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  supplierName: string;

  /** Optional link to a phonebook contact (category=supplier) — not
   * required, since a one-off supplier a business deals with once
   * doesn't need a full contact record just to log a bill. */
  @Column({ type: 'integer', nullable: true })
  supplierContactId?: number | null;

  @Column({ nullable: true })
  invoiceNumber?: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'date', nullable: true })
  dueDate?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'timestamp', nullable: true })
  @Index()
  paidAt?: Date | null;

  @Column({ type: 'varchar', nullable: true })
  storagePath?: string | null;

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
