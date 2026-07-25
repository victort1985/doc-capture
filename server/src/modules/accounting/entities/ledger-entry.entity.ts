import {
  Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { Account } from './account.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

/**
 * One double-entry journal line: debits `debitAccount` and credits
 * `creditAccount` by the same `amount` — by construction, every
 * LedgerEntry is balanced on its own (never split across separate
 * debit/credit rows that could drift apart), which is what makes a
 * trial balance always sum to zero automatically rather than needing
 * a reconciliation step.
 */
@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  @Index()
  date: string;

  @Column()
  description: string;

  @ManyToOne(() => Account)
  debitAccount: Account;

  @ManyToOne(() => Account)
  creditAccount: Account;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  amount: number;

  /** What document this entry came from (e.g. "invoice", "payment",
   * "credit-note") — lets a report jump back to the source document,
   * and lets LedgerPostingService avoid double-posting the same
   * document if it's ever called twice for the same one. */
  @Column({ type: 'varchar', nullable: true })
  @Index()
  sourceType?: string | null;

  @Column({ type: 'integer', nullable: true })
  @Index()
  sourceId?: number | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @Index()
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;
}
