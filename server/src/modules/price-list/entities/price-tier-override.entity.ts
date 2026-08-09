import { Column, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { PriceTier } from './price-tier.entity';
import { PriceListItem } from './price-list-item.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

/** One tier's specific price for one catalog item — see PriceTier's
 * own doc comment for why this is override-only (sparse), not a full
 * copy of the catalog per tier. */
@Entity('price_tier_overrides')
@Index(['tier', 'priceListItem'], { unique: true })
export class PriceTierOverride {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => PriceTier, { onDelete: 'CASCADE' })
  tier: PriceTier;

  @ManyToOne(() => PriceListItem, { onDelete: 'CASCADE' })
  priceListItem: PriceListItem;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numericTransformer })
  price: number;
}
