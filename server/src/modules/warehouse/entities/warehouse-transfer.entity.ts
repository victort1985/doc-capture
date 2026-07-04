import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Location } from '../../locations/entities/location.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

export interface TransferItem {
  warehouseItemId: number;
  name: string;
  barcode: string;
  quantity: number;
}

/**
 * A record of equipment moved from one location's independent warehouse
 * to another. Created automatically whenever a user with the
 * `warehouseTransfer` permission completes a transfer in the app — acts
 * as the "накладная о переводе" (transfer note) for that move.
 */
@Entity('warehouse_transfers')
export class WarehouseTransfer {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Location, { nullable: true, onDelete: 'SET NULL' })
  fromLocation?: Location;

  @ManyToOne(() => Location, { nullable: true, onDelete: 'SET NULL' })
  toLocation?: Location;

  /** Snapshot of the transferred rows at the time of transfer (name/barcode/qty),
   * kept even if the underlying warehouse item is later renamed or removed. */
  @Column({ type: 'jsonb', default: [] })
  items: TransferItem[];

  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** User who performed the transfer from the app. */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;
}
