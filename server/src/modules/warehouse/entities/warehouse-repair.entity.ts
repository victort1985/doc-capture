import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { WarehouseItem } from './warehouse-item.entity';

@Entity('warehouse_repairs')
export class WarehouseRepair {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => WarehouseItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'itemId' })
  item: WarehouseItem;

  @Column()
  itemId: number;

  @Column({ nullable: true })
  supplierName?: string;

  @Column({ nullable: true })
  supplierPhone?: string;

  @Column({ nullable: true })
  supplierEmail?: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ nullable: true })
  barcode?: string;

  @CreateDateColumn()
  sentAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  returnedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
