import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * A named pricing tier (e.g. "Wholesale", "VIP", "Standard") — a
 * client assigned to a tier (see PhoneBookContact.priceTier) gets
 * that tier's own prices instead of PriceListItem's own base price,
 * wherever an override exists (see PriceTierOverride) — an item with
 * no override for a given tier still falls back to its base price,
 * so setting up a new tier only means entering the prices that
 * actually differ, not re-typing the entire catalog.
 */
@Entity('price_tiers')
export class PriceTier {
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
