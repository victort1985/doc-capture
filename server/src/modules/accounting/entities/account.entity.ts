import {
  Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

export enum AccountType {
  ASSET = 'asset',
  LIABILITY = 'liability',
  EQUITY = 'equity',
  REVENUE = 'revenue',
  EXPENSE = 'expense',
}

/**
 * A single line in the chart of accounts (תוכנית חשבונות) —
 * requirement #7. Every LedgerEntry debits one Account and credits
 * another; the sum of all entries per account over a period is what
 * a trial balance/general ledger report reads off directly, rather
 * than re-deriving totals from documents each time.
 */
@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn()
  id: number;

  /** Short numeric/alphanumeric code (e.g. "1100") — how accountants
   * actually refer to accounts, not just the name. */
  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: AccountType })
  type: AccountType;

  /** System accounts (isSystem: true) back the automatic postings in
   * LedgerPostingService and can't be deleted from the admin UI, only
   * renamed — deleting one out from under the auto-posting logic
   * would silently break every future invoice/payment. Org-added
   * accounts (e.g. specific expense categories) are freely
   * removable. */
  @Column({ default: false })
  isSystem: boolean;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
