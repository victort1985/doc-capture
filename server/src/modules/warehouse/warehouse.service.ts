import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { WarehouseCategory } from './entities/warehouse-category.entity';
import { WarehouseItem } from './entities/warehouse-item.entity';
import { WarehouseTransaction, TransactionType } from './entities/warehouse-transaction.entity';
import { WarehouseRepair } from './entities/warehouse-repair.entity';
import { WarehouseTransfer } from './entities/warehouse-transfer.entity';
import { ServiceCall } from '../calls/entities/service-call.entity';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(WarehouseCategory) private readonly catsRepo: Repository<WarehouseCategory>,
    @InjectRepository(WarehouseItem) private readonly itemsRepo: Repository<WarehouseItem>,
    @InjectRepository(WarehouseTransaction) private readonly txRepo: Repository<WarehouseTransaction>,
    @InjectRepository(WarehouseRepair) private readonly repairsRepo: Repository<WarehouseRepair>,
    @InjectRepository(WarehouseTransfer) private readonly transfersRepo: Repository<WarehouseTransfer>,
    @InjectRepository(ServiceCall) private readonly callsRepo: Repository<ServiceCall>,
  ) {}

  // ── Barcode generation ─────────────────────────────────────────────

  /** Generates a unique barcode string — prefix + 8-digit zero-padded number. */
  async generateBarcode(prefix = 'DC'): Promise<string> {
    const count = await this.itemsRepo.count();
    return `${prefix}${String(count + 1).padStart(8, '0')}`;
  }

  // ── Categories ─────────────────────────────────────────────────────

  findCategories(organizationId: number | null): Promise<WarehouseCategory[]> {
    return this.catsRepo.find({
      where: organizationId != null
        ? [{ organization: { id: organizationId } }, { organization: IsNull() }]
        : {},
      order: { name: 'ASC' },
    });
  }

  async createCategory(name: string, description: string | undefined, organizationId: number | null): Promise<WarehouseCategory> {
    return this.catsRepo.save(this.catsRepo.create({
      name,
      description,
      organization: organizationId ? ({ id: organizationId } as any) : undefined,
    }));
  }

  async removeCategory(id: number): Promise<void> {
    const c = await this.catsRepo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Category not found');
    await this.catsRepo.remove(c);
  }

  // ── Items ──────────────────────────────────────────────────────────

  findItems(organizationId: number | null, categoryId?: number, q?: string, locationId?: number, mainOnly?: boolean): Promise<WarehouseItem[]> {
    const qb = this.itemsRepo.createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.warehouseLocation', 'warehouseLocation')
      .orderBy('item.name', 'ASC');
    if (organizationId != null) {
      qb.andWhere('(item.organizationId = :orgId OR item.organizationId IS NULL)', { orgId: organizationId });
    }
    if (categoryId) qb.andWhere('category.id = :catId', { catId: categoryId });
    if (locationId) qb.andWhere('warehouseLocation.id = :locId', { locId: locationId });
    if (mainOnly) qb.andWhere('warehouseLocation.isMainWarehouse = true');
    if (q?.trim()) qb.andWhere('(item.name ILIKE :q OR item.barcode ILIKE :q)', { q: `%${q.trim()}%` });
    return qb.getMany();
  }

  async findItemByBarcode(barcode: string, organizationId: number | null): Promise<WarehouseItem | null> {
    return this.itemsRepo.findOne({
      where: { barcode },
      relations: ['category'],
    });
  }

  async createItem(dto: Partial<WarehouseItem> & { categoryId?: number; locationId?: number }, organizationId: number | null): Promise<WarehouseItem> {
    const barcode = dto.barcode || await this.generateBarcode();
    const existing = await this.itemsRepo.findOne({ where: { barcode } });
    if (existing) throw new ConflictException(`Barcode ${barcode} already in use`);
    return this.itemsRepo.save(this.itemsRepo.create({
      ...dto,
      barcode,
      category: dto.categoryId ? ({ id: dto.categoryId } as any) : undefined,
      warehouseLocation: dto.locationId ? ({ id: dto.locationId } as any) : undefined,
      organization: organizationId ? ({ id: organizationId } as any) : undefined,
    }));
  }

  async updateItem(id: number, dto: Partial<WarehouseItem> & { categoryId?: number; locationId?: number }, organizationId: number | null): Promise<WarehouseItem> {
    const item = await this.itemsRepo.findOne({ where: { id }, relations: ['category', 'organization', 'warehouseLocation'] });
    if (!item) throw new NotFoundException('Item not found');
    if (organizationId != null && item.organization?.id !== organizationId) throw new NotFoundException('Item not found');
    Object.assign(item, {
      ...dto,
      category: dto.categoryId !== undefined ? ({ id: dto.categoryId } as any) : item.category,
      warehouseLocation: dto.locationId !== undefined ? ({ id: dto.locationId } as any) : item.warehouseLocation,
    });
    return this.itemsRepo.save(item);
  }

  async removeItem(id: number): Promise<void> {
    const item = await this.itemsRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Item not found');
    await this.itemsRepo.remove(item);
  }

  // ── Transactions ───────────────────────────────────────────────────

  findTransactions(itemId: number): Promise<WarehouseTransaction[]> {
    return this.txRepo.find({
      where: { item: { id: itemId } },
      relations: ['registeredBy'],
      order: { createdAt: 'DESC' },
    });
  }

  async addTransaction(
    itemId: number,
    type: TransactionType,
    quantity: number,
    reason: string | undefined,
    referenceCallId: number | undefined,
    userId: number,
  ): Promise<WarehouseTransaction> {
    const item = await this.itemsRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Item not found');
    const delta = type === TransactionType.IN ? quantity : -quantity;
    item.quantity = Math.max(0, item.quantity + delta);
    await this.itemsRepo.save(item);
    return this.txRepo.save(this.txRepo.create({
      item: { id: itemId } as any,
      type,
      quantity,
      reason,
      referenceCallId,
      registeredBy: { id: userId } as any,
    }));
  }

  // ── Repair methods ──────────────────────────────────────────────────────

  async sendToRepair(itemId: number, dto: {
    supplierName?: string; supplierPhone?: string; supplierEmail?: string;
    reason?: string; barcode?: string; notes?: string;
  }) {
    const item = await this.itemsRepo.findOneBy({ id: itemId });
    if (!item) throw new NotFoundException('Item not found');

    await this.itemsRepo.update(itemId, { repairStatus: 'in_repair' });
    return this.repairsRepo.save(this.repairsRepo.create({
      item: { id: itemId } as any,
      itemId,
      ...dto,
    }));
  }

  async returnFromRepair(repairId: number, notes?: string) {
    const repair = await this.repairsRepo.findOneBy({ id: repairId });
    if (!repair) throw new NotFoundException('Repair record not found');
    repair.returnedAt = new Date();
    if (notes) repair.notes = notes;
    await this.repairsRepo.save(repair);
    await this.itemsRepo.update(repair.itemId, { repairStatus: 'returned' });
    return repair;
  }

  async listRepairs(organizationId: number) {
    return this.repairsRepo
      .createQueryBuilder('r')
      .innerJoin('r.item', 'i')
      .where('i.organizationId = :organizationId', { organizationId })
      .andWhere('r.returnedAt IS NULL')
      .select(['r', 'i.id', 'i.name', 'i.barcode', 'i.location'])
      .orderBy('r.sentAt', 'DESC')
      .getMany();
  }

  async getItemRepairs(itemId: number) {
    return this.repairsRepo.find({
      where: { itemId },
      order: { sentAt: 'DESC' },
    });
  }

  // ── Location-to-location equipment transfers ──────────────────────────

  /**
   * Moves the given warehouse items to `toLocationId` and records the
   * move as a transfer document. Each item's `quantity` is transferred
   * in full (transfers move whole barcoded rows, not partial splits).
   */
  async createTransfer(
    dto: { fromLocationId: number; toLocationId: number; itemIds: number[]; notes?: string },
    userId: number,
    organizationId: number | null,
  ): Promise<WarehouseTransfer> {
    if (dto.fromLocationId === dto.toLocationId) {
      throw new ConflictException('Source and destination locations must be different');
    }
    if (!dto.itemIds?.length) {
      throw new ConflictException('At least one item is required');
    }
    const items = await this.itemsRepo.find({ where: { id: In(dto.itemIds) } });
    if (items.length !== dto.itemIds.length) {
      throw new NotFoundException('One or more items not found');
    }
    const snapshot = items.map((i) => ({
      warehouseItemId: i.id,
      name: i.name,
      barcode: i.barcode,
      quantity: i.quantity,
    }));
    for (const item of items) {
      item.warehouseLocation = { id: dto.toLocationId } as any;
    }
    await this.itemsRepo.save(items);
    const transfer = this.transfersRepo.create({
      fromLocation: { id: dto.fromLocationId } as any,
      toLocation: { id: dto.toLocationId } as any,
      items: snapshot,
      notes: dto.notes,
      createdBy: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : undefined,
    });
    return this.transfersRepo.save(transfer);
  }

  listTransfers(organizationId: number | null): Promise<WarehouseTransfer[]> {
    return this.transfersRepo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      relations: ['fromLocation', 'toLocation', 'createdBy'],
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // ── Unified per-item service history ────────────────────────────────
  /**
   * One chronological timeline for a single piece of equipment —
   * stock in/out (with the service call it was used on, if any),
   * repairs sent/returned, and cross-location transfers. Per-client
   * warehouse reports already exist (movement summary by item); this
   * is the complementary "life story of this specific unit" view,
   * useful for rental/service equipment where what matters is this
   * exact barcode's history, not just aggregate stock movement.
   */
  async getItemHistory(itemId: number) {
    const item = await this.itemsRepo.findOne({
      where: { id: itemId },
      relations: ['category', 'warehouseLocation', 'organization'],
    });
    if (!item) throw new NotFoundException('Item not found');

    const [transactions, repairs, transferRows] = await Promise.all([
      this.txRepo.find({ where: { item: { id: itemId } }, relations: ['registeredBy'], order: { createdAt: 'DESC' } }),
      this.repairsRepo.find({ where: { itemId }, order: { sentAt: 'DESC' } }),
      this.transfersRepo.query(
        `
        SELECT x.id, x."createdAt", x.notes,
               fl.name AS "fromLocationName", tl.name AS "toLocationName",
               u.username AS "createdByName"
        FROM warehouse_transfers x
        LEFT JOIN locations fl ON fl.id = x."fromLocationId"
        LEFT JOIN locations tl ON tl.id = x."toLocationId"
        LEFT JOIN users u ON u.id = x."createdById"
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements(x.items) elem
          WHERE (elem->>'warehouseItemId')::int = $1
        )
        ORDER BY x."createdAt" DESC
        `,
        [itemId],
      ),
    ]);

    const callIds = [...new Set(transactions.map((t) => t.referenceCallId).filter((x): x is number => !!x))];
    const calls = callIds.length
      ? await this.callsRepo.find({ where: { id: In(callIds) }, select: ['id', 'place', 'status', 'createdAt'] })
      : [];
    const callsById = new Map(calls.map((c) => [c.id, c]));

    const events = [
      ...transactions.map((t) => ({
        kind: 'transaction' as const,
        date: t.createdAt,
        transactionType: t.type,
        quantity: t.quantity,
        reason: t.reason ?? null,
        byUser: t.registeredBy?.username ?? null,
        call: t.referenceCallId ? callsById.get(t.referenceCallId) ?? null : null,
      })),
      ...repairs.map((r) => ({
        kind: 'repair' as const,
        date: r.sentAt,
        returnedAt: r.returnedAt ?? null,
        supplierName: r.supplierName ?? null,
        reason: r.reason ?? null,
        notes: r.notes ?? null,
      })),
      ...transferRows.map((x: any) => ({
        kind: 'transfer' as const,
        date: x.createdAt,
        fromLocationName: x.fromLocationName ?? null,
        toLocationName: x.toLocationName ?? null,
        byUser: x.createdByName ?? null,
        notes: x.notes ?? null,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { item, events };
  }
}
