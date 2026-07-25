import {
  Column, CreateDateColumn, Entity, Index, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

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

  @Column({ type: 'enum', enum: ['cash', 'bank'], default: 'cash' })
  method: 'cash' | 'bank';

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
