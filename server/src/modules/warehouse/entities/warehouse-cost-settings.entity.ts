import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

export enum CostMethod {
  FIFO = 'fifo',
  WEIGHTED_AVERAGE = 'weighted_average',
}

@Entity('warehouse_cost_settings')
export class WarehouseCostSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @Column({ type: 'enum', enum: CostMethod, default: CostMethod.WEIGHTED_AVERAGE })
  method: CostMethod;
}
