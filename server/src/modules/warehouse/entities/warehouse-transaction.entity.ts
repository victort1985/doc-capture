import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WarehouseItem } from './warehouse-item.entity';
import { User } from '../../users/entities/user.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

export enum TransactionType {
  IN = 'in',   // прибыло на склад
  OUT = 'out', // выбыло со склада
}

@Entity('warehouse_transactions')
export class WarehouseTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => WarehouseItem, { onDelete: 'CASCADE' })
  item: WarehouseItem;

  @Column({ type: 'enum', enum: TransactionType })
  type: TransactionType;

  @Column()
  quantity: number;

  @Column({ nullable: true })
  reason?: string; // e.g. "Used in call #42", "Purchase", "Write-off"

  /** Cost per unit — set on an IN transaction to record what was
   * actually paid for that batch (a purchase/receipt), left null for
   * an OUT transaction's own manual input (its cost gets computed
   * automatically instead — see WarehouseCogsService.recordOutCost —
   * based on the organization's chosen FIFO/weighted-average method,
   * since a sale's cost isn't something a person types in, it's
   * derived from what was actually in stock). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: numericTransformer })
  unitCost?: number | null;

  /** Total cost of goods sold for THIS specific transaction (unitCost
   * × quantity, but stored explicitly rather than always
   * recalculated) — only ever set on an OUT transaction, permanently
   * fixed at the moment it's recorded so a later purchase at a
   * different price doesn't retroactively change what an old sale's
   * margin was reported as. */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true, transformer: numericTransformer })
  cogsAmount?: number | null;

  @Column({ nullable: true })
  referenceCallId?: number; // optional link to a service call

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  registeredBy?: User;

  @CreateDateColumn()
  createdAt: Date;
}
