import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { WarehouseCategory } from './warehouse-category.entity';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity('warehouse_items')
export class WarehouseItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ unique: true })
  barcode: string; // generated or manually assigned

  @ManyToOne(() => WarehouseCategory, { nullable: true, onDelete: 'SET NULL' })
  category?: WarehouseCategory;

  @Column({ default: 0 })
  quantity: number; // current stock

  @Column({ nullable: true })
  unit?: string; // шт, кг, м…

  @Column({ nullable: true })
  location?: string; // shelf/rack label

  @Column({ nullable: true })
  notes?: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  /** 'none' | 'in_repair' | 'returned' */
  @Column({ default: 'none' })
  repairStatus: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
