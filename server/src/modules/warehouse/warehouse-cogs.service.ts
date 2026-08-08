import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WarehouseTransaction, TransactionType } from './entities/warehouse-transaction.entity';
import { WarehouseCostSettings, CostMethod } from './entities/warehouse-cost-settings.entity';

/**
 * Computes cost-of-goods-sold for an OUT transaction, using whichever
 * method the organization has chosen. Rather than maintaining a
 * running layer ledger that has to be kept perfectly in sync forever,
 * this replays the item's own transaction history up to (and
 * including) the transaction being costed each time — for the
 * transaction volumes a small service business's warehouse actually
 * sees, replaying the full history is cheap, and it's structurally
 * impossible for a running ledger to drift out of sync with the
 * actual transactions when there's no separate ledger to drift.
 */
@Injectable()
export class WarehouseCogsService {
  constructor(
    @InjectRepository(WarehouseTransaction) private readonly txRepo: Repository<WarehouseTransaction>,
    @InjectRepository(WarehouseCostSettings) private readonly settingsRepo: Repository<WarehouseCostSettings>,
  ) {}

  async getSettings(organizationId: number | null): Promise<WarehouseCostSettings> {
    const existing = await this.settingsRepo.findOne({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    if (existing) return existing;
    return this.settingsRepo.create({ method: CostMethod.WEIGHTED_AVERAGE });
  }

  async updateSettings(organizationId: number | null, method: CostMethod): Promise<WarehouseCostSettings> {
    let settings = await this.settingsRepo.findOne({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    if (!settings) {
      settings = this.settingsRepo.create({ organization: organizationId != null ? ({ id: organizationId } as any) : undefined });
    }
    settings.method = method;
    return this.settingsRepo.save(settings);
  }

  /** Weighted-average cost for `outQuantity` units, using every IN
   * transaction up through `relevant` (already time-filtered by the
   * caller). Returns null if no IN transaction in history has a
   * recorded unitCost at all — rather than silently costing at zero,
   * which would understate COGS and overstate margin. */
  private weightedAverageCost(relevant: WarehouseTransaction[], outQuantity: number): number | null {
    let totalQty = 0;
    let totalCost = 0;
    for (const t of relevant) {
      if (t.type === TransactionType.IN && t.unitCost != null) {
        totalQty += t.quantity;
        totalCost += t.quantity * Number(t.unitCost);
      }
    }
    if (totalQty === 0) return null;
    return Math.round((totalCost / totalQty) * outQuantity * 100) / 100;
  }

  /** FIFO cost for the LAST out transaction in `relevant` (the one
   * being costed — callers pass history truncated to end exactly at
   * that transaction). Single pass: maintains cost layers from every
   * IN transaction, consumes from the oldest layer first for every
   * OUT transaction encountered along the way (including earlier
   * ones — their consumption has to happen first, in order, for the
   * final out's own cost to be correct), and captures the cost of
   * only the very last OUT (the target). Returns null if covering the
   * target OUT would require consuming stock whose cost was never
   * recorded (an IN transaction entered with no unitCost). */
  private fifoCost(relevant: WarehouseTransaction[]): number | null {
    const layers: { remaining: number; unitCost: number; known: boolean }[] = [];
    let targetCost: number | null = null;

    const consume = (qty: number): number | null => {
      let toConsume = qty;
      let cost = 0;
      for (const layer of layers) {
        if (toConsume <= 0) break;
        const take = Math.min(layer.remaining, toConsume);
        if (take <= 0) continue;
        if (!layer.known) return null; // this OUT touches stock with no known cost
        cost += take * layer.unitCost;
        layer.remaining -= take;
        toConsume -= take;
      }
      return toConsume > 0 ? null : cost; // toConsume > 0 means not enough recorded stock at all
    };

    for (let i = 0; i < relevant.length; i++) {
      const t = relevant[i];
      if (t.type === TransactionType.IN) {
        layers.push({ remaining: t.quantity, unitCost: t.unitCost != null ? Number(t.unitCost) : 0, known: t.unitCost != null });
      } else {
        const cost = consume(t.quantity);
        if (i === relevant.length - 1) targetCost = cost; // the transaction being costed is always last in `relevant`
      }
    }
    return targetCost != null ? Math.round(targetCost * 100) / 100 : null;
  }

  /** Total cost for removing `outQuantity` units of `itemId`, as of
   * `asOf` (pass the specific out transaction's own createdAt so a
   * later purchase never gets counted as available stock for an
   * earlier sale). */
  async computeCost(itemId: number, outQuantity: number, asOf: Date, method: CostMethod): Promise<number | null> {
    const history = await this.txRepo.find({ where: { item: { id: itemId } }, order: { createdAt: 'ASC', id: 'ASC' } });
    const relevant = history.filter((t) => t.createdAt <= asOf);
    if (relevant.length === 0) return null;

    if (method === CostMethod.WEIGHTED_AVERAGE) return this.weightedAverageCost(relevant, outQuantity);
    return this.fifoCost(relevant);
  }

  /** Called right after an OUT transaction is created — computes and
   * persists its cogsAmount using the organization's configured
   * method, permanently, so it never silently changes later. */
  async recordOutCost(transaction: WarehouseTransaction, organizationId: number | null): Promise<void> {
    const settings = await this.getSettings(organizationId);
    const cost = await this.computeCost(transaction.item.id, transaction.quantity, transaction.createdAt, settings.method);
    transaction.cogsAmount = cost;
    await this.txRepo.save(transaction);
  }

  /** Sum of every OUT transaction's cogsAmount in a period — the
   * report this whole feature exists for: revenue minus this is a
   * REAL gross profit, not the P&L's own "Expenses" lump sum, which
   * never distinguished cost-of-goods from operating expenses like
   * rent (see AccountingService.profitAndLoss's own account
   * categorization — it has no separate COGS account at all). */
  async getCogsForPeriod(organizationId: number | null, from: Date, to: Date): Promise<{ totalCogs: number; unknownCostCount: number }> {
    const qb = this.txRepo.createQueryBuilder('t')
      .leftJoin('t.item', 'item')
      .leftJoin('item.organization', 'organization')
      .where('t.type = :type', { type: TransactionType.OUT })
      .andWhere('t.createdAt BETWEEN :from AND :to', { from, to });
    if (organizationId != null) qb.andWhere('organization.id = :orgId', { orgId: organizationId });
    const outTransactions = await qb.getMany();
    const totalCogs = outTransactions.reduce((s, t) => s + Number(t.cogsAmount ?? 0), 0);
    const unknownCostCount = outTransactions.filter((t) => t.cogsAmount == null).length;
    return { totalCogs: Math.round(totalCogs * 100) / 100, unknownCostCount };
  }
}
