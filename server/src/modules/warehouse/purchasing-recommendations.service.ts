import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WarehouseItem } from './entities/warehouse-item.entity';
import { WarehouseTransaction, TransactionType } from './entities/warehouse-transaction.entity';

const LOOKBACK_DAYS = 90;
const DAYS_OF_STOCK_WARNING_THRESHOLD = 14;

export interface PurchasingRecommendation {
  itemId: number;
  itemName: string;
  currentQuantity: number;
  unit?: string;
  reorderPoint?: number | null;
  preferredSupplierName?: string | null;
  avgDailyConsumption: number;
  projectedDaysOfStock: number | null;
  reason: 'below_reorder_point' | 'projected_stockout';
  suggestedOrderQuantity: number;
}

@Injectable()
export class PurchasingRecommendationsService {
  constructor(
    @InjectRepository(WarehouseItem) private readonly itemsRepo: Repository<WarehouseItem>,
    @InjectRepository(WarehouseTransaction) private readonly txRepo: Repository<WarehouseTransaction>,
  ) {}

  /** Every item worth reordering soon, for two independent reasons
   * that don't require each other: (1) an explicit reorderPoint has
   * been crossed — a person's own configured threshold, honored
   * regardless of recent activity, since a slow-moving but critical
   * part (e.g. a rare replacement component) may have low consumption
   * but still needs to be flagged the moment stock is low; (2) recent
   * consumption rate projects a stockout within
   * DAYS_OF_STOCK_WARNING_THRESHOLD, even with no explicit
   * reorderPoint set at all — catches fast-moving items nobody got
   * around to configuring a threshold for. An item can appear for
   * either reason, or both; reason reflects whichever triggered first
   * in that priority order. */
  async getRecommendations(organizationId: number | null): Promise<PurchasingRecommendation[]> {
    const items = await this.itemsRepo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
    });
    if (items.length === 0) return [];

    const since = new Date();
    since.setDate(since.getDate() - LOOKBACK_DAYS);

    const qb = this.txRepo.createQueryBuilder('t')
      .select('t."itemId"', 'itemId')
      .addSelect('SUM(t.quantity)', 'totalOut')
      .where('t.type = :type', { type: TransactionType.OUT })
      .andWhere('t."createdAt" >= :since', { since })
      .groupBy('t."itemId"');
    const outRows = await qb.getRawMany<{ itemId: number; totalOut: string }>();
    const outByItemId = new Map(outRows.map((r) => [r.itemId, Number(r.totalOut)]));

    const recommendations: PurchasingRecommendation[] = [];
    for (const item of items) {
      const totalOutInWindow = outByItemId.get(item.id) ?? 0;
      const avgDailyConsumption = Math.round((totalOutInWindow / LOOKBACK_DAYS) * 100) / 100;
      const projectedDaysOfStock = avgDailyConsumption > 0 ? Math.round(item.quantity / avgDailyConsumption) : null;

      const belowReorderPoint = item.reorderPoint != null && item.reorderPoint > 0 && item.quantity <= item.reorderPoint;
      const projectedStockout = projectedDaysOfStock != null && projectedDaysOfStock <= DAYS_OF_STOCK_WARNING_THRESHOLD;

      if (!belowReorderPoint && !projectedStockout) continue;

      const suggestedOrderQuantity = avgDailyConsumption > 0
        ? Math.max(1, Math.ceil(avgDailyConsumption * 30))
        : Math.max(1, (item.reorderPoint ?? 1) * 2);

      recommendations.push({
        itemId: item.id,
        itemName: item.name,
        currentQuantity: item.quantity,
        unit: item.unit,
        reorderPoint: item.reorderPoint,
        preferredSupplierName: item.preferredSupplierName,
        avgDailyConsumption,
        projectedDaysOfStock,
        reason: belowReorderPoint ? 'below_reorder_point' : 'projected_stockout',
        suggestedOrderQuantity,
      });
    }

    return recommendations.sort((a, b) => {
      if (a.reason !== b.reason) return a.reason === 'below_reorder_point' ? -1 : 1;
      const aDays = a.projectedDaysOfStock ?? Infinity;
      const bDays = b.projectedDaysOfStock ?? Infinity;
      return aDays - bDays;
    });
  }
}
