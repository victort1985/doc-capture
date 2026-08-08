import {
  Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { LedgerEntry } from './ledger-entry.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

export enum BankLineStatus {
  UNMATCHED = 'unmatched',
  MATCHED = 'matched',
  IGNORED = 'ignored',
}

/**
 * One row from an imported bank statement (CSV/XLSX export from the
 * bank) — kept as its own record, separate from LedgerEntry, so
 * reconciliation is "does every real bank movement have a matching
 * ledger entry, and vice versa" rather than trying to force the
 * statement itself into the double-entry model. `amount` is signed:
 * positive for money in, negative for money out, matching how a bank
 * statement itself reads.
 */
@Entity('bank_statement_lines')
export class BankStatementLine {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  @Index()
  date: string;

  @Column()
  description: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  @Column({ type: 'varchar', nullable: true })
  reference?: string | null;

  @Column({ type: 'enum', enum: BankLineStatus, default: BankLineStatus.UNMATCHED })
  @Index()
  status: BankLineStatus;

  /** The ledger entry this line was reconciled against, once matched
   * — nullable until then. Deliberately no FK cascade-delete tie
   * beyond the normal one: if the ledger entry itself is ever removed
   * some other way, this just reverts to unmatched territory rather
   * than silently vanishing. */
  @ManyToOne(() => LedgerEntry, { nullable: true, onDelete: 'SET NULL' })
  matchedLedgerEntry?: LedgerEntry | null;

  /** Groups every line from one import together, so an accidental
   * duplicate upload of the same statement can be spotted and the
   * whole batch removed at once rather than line by line. */
  @Column({ type: 'varchar' })
  @Index()
  importBatchId: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @Index()
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;
}
