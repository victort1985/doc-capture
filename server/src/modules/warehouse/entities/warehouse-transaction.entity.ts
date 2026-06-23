import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { WarehouseItem } from './warehouse-item.entity';
import { User } from '../../users/entities/user.entity';

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

  @Column({ nullable: true })
  referenceCallId?: number; // optional link to a service call

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  registeredBy?: User;

  @CreateDateColumn()
  createdAt: Date;
}
