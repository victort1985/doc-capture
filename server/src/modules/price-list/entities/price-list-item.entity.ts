import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

export enum PriceListItemType {
  DEVICE = 'device',
  SERVICE = 'service',
}

/**
 * A reusable catalog of "things we charge for" — equipment/devices
 * and services — each with a standard reference price. Exists purely
 * for convenience when building quotes/invoices/delivery notes:
 * picking an entry here auto-fills that line's description and price,
 * which can still be freely edited/overridden afterward on the
 * document itself (this catalog is never referenced back from a
 * document — it's a one-time copy-in at creation time).
 */
@Entity('price_list_items')
export class PriceListItem {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'varchar', default: PriceListItemType.DEVICE })
  type: PriceListItemType;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: numericTransformer })
  price: number;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Index()
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
