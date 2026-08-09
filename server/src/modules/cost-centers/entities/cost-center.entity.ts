import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * A named project/department/branch for tagging spend and revenue
 * against (e.g. "Project A", "Marketing", "North Branch") — lets a
 * service business with several concurrent jobs or cost pools answer
 * "how much did this specific one actually cost, and how much
 * revenue did it bring in" rather than only ever seeing organization-
 * wide totals. See Expense.costCenter / SupplierInvoice.costCenter /
 * Invoice.costCenter for where this gets attached.
 */
@Entity('cost_centers')
export class CostCenter {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Index()
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;
}
