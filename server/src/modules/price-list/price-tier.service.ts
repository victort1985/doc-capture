import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceTier } from './entities/price-tier.entity';
import { PriceTierOverride } from './entities/price-tier-override.entity';
import { PriceListItem } from './entities/price-list-item.entity';

export interface CatalogEntryForTier {
  id: number;
  name: string;
  type: string;
  basePrice: number;
  tierPrice: number;
  overridden: boolean;
}

@Injectable()
export class PriceTierService {
  constructor(
    @InjectRepository(PriceTier) private readonly tiersRepo: Repository<PriceTier>,
    @InjectRepository(PriceTierOverride) private readonly overridesRepo: Repository<PriceTierOverride>,
    @InjectRepository(PriceListItem) private readonly itemsRepo: Repository<PriceListItem>,
  ) {}

  async findAllTiers(organizationId: number | null): Promise<PriceTier[]> {
    return this.tiersRepo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { name: 'ASC' },
    });
  }

  async createTier(organizationId: number | null, name: string): Promise<PriceTier> {
    return this.tiersRepo.save(this.tiersRepo.create({
      name,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
    }));
  }

  private async findTierScoped(id: number, organizationId: number | null): Promise<PriceTier> {
    const tier = await this.tiersRepo.findOne({ where: { id }, relations: ['organization'] });
    if (!tier) throw new NotFoundException('Price tier not found');
    if (organizationId != null && tier.organization?.id !== organizationId) throw new NotFoundException('Price tier not found');
    return tier;
  }

  async renameTier(id: number, organizationId: number | null, name: string): Promise<PriceTier> {
    const tier = await this.findTierScoped(id, organizationId);
    tier.name = name;
    return this.tiersRepo.save(tier);
  }

  async removeTier(id: number, organizationId: number | null): Promise<void> {
    const tier = await this.findTierScoped(id, organizationId);
    await this.tiersRepo.remove(tier);
  }

  /** Sets (or clears, if price is null) this tier's override price
   * for one catalog item — verifies both the tier and the catalog
   * item belong to the caller's own organization before touching
   * anything, same fetch-then-compare isolation pattern used
   * throughout this app. */
  async setOverride(tierId: number, organizationId: number | null, priceListItemId: number, price: number | null): Promise<void> {
    await this.findTierScoped(tierId, organizationId); // throws if not accessible
    const item = await this.itemsRepo.findOne({ where: { id: priceListItemId }, relations: ['organization'] });
    if (!item) throw new NotFoundException('Price list item not found');
    if (organizationId != null && item.organization?.id !== organizationId) throw new NotFoundException('Price list item not found');

    const existing = await this.overridesRepo.findOne({ where: { tier: { id: tierId }, priceListItem: { id: priceListItemId } } });
    if (price == null) {
      if (existing) await this.overridesRepo.remove(existing);
      return;
    }
    if (existing) {
      existing.price = price;
      await this.overridesRepo.save(existing);
    } else {
      await this.overridesRepo.save(this.overridesRepo.create({ tier: { id: tierId } as any, priceListItem: { id: priceListItemId } as any, price }));
    }
  }

  /** The full catalog with this tier's prices applied where an
   * override exists — what a person actually wants to see when
   * building a quote/invoice for a client on this tier: every item,
   * clearly marked which ones differ from standard, rather than a
   * sparse override-only list that would need cross-referencing
   * against the base catalog by hand. */
  async getCatalogForTier(tierId: number, organizationId: number | null): Promise<CatalogEntryForTier[]> {
    await this.findTierScoped(tierId, organizationId);
    const [items, overrides] = await Promise.all([
      this.itemsRepo.find({ where: organizationId != null ? { organization: { id: organizationId } } : {}, order: { name: 'ASC' } }),
      this.overridesRepo.find({ where: { tier: { id: tierId } }, relations: ['priceListItem'] }),
    ]);
    const overrideByItemId = new Map(overrides.map((o) => [o.priceListItem.id, Number(o.price)]));
    return items.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type,
      basePrice: Number(item.price),
      tierPrice: overrideByItemId.get(item.id) ?? Number(item.price),
      overridden: overrideByItemId.has(item.id),
    }));
  }
}
