import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

export interface TransferItemRecord {
  itemId?: number;
  name: string;
  quantity: number;
  barcode?: string;
}

@Entity('warehouse_transfers')
export class WarehouseTransfer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  noteNumber: string;

  @Column({ nullable: true })
  fromLocation?: string;

  @Column({ nullable: true })
  toLocation?: string;

  @Column({ type: 'jsonb', default: [] })
  items: TransferItemRecord[];

  @Column({ nullable: true })
  notes?: string;

  @Column({ nullable: true })
  pdfPath?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL', eager: false })
  createdBy?: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;
}
