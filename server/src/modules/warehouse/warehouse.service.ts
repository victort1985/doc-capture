import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { WarehouseCategory } from './entities/warehouse-category.entity';
import { WarehouseItem } from './entities/warehouse-item.entity';
import { WarehouseTransaction, TransactionType } from './entities/warehouse-transaction.entity';
import { WarehouseRepair } from './entities/warehouse-repair.entity';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(WarehouseCategory) private readonly catsRepo: Repository<WarehouseCategory>,
    @InjectRepository(WarehouseItem) private readonly itemsRepo: Repository<WarehouseItem>,
    @InjectRepository(WarehouseTransaction) private readonly txRepo: Repository<WarehouseTransaction>,
    @InjectRepository(WarehouseRepair) private readonly repairsRepo: Repository<WarehouseRepair>,
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

  findItems(organizationId: number | null, categoryId?: number, q?: string): Promise<WarehouseItem[]> {
    const qb = this.itemsRepo.createQueryBuilder('item')
      .leftJoinAndSelect('item.category', 'category')
      .orderBy('item.name', 'ASC');
    if (organizationId != null) {
      qb.andWhere('(item.organizationId = :orgId OR item.organizationId IS NULL)', { orgId: organizationId });
    }
    if (categoryId) qb.andWhere('category.id = :catId', { catId: categoryId });
    if (q?.trim()) qb.andWhere('(item.name ILIKE :q OR item.barcode ILIKE :q)', { q: `%${q.trim()}%` });
    return qb.getMany();
  }

  async findItemByBarcode(barcode: string, organizationId: number | null): Promise<WarehouseItem | null> {
    return this.itemsRepo.findOne({
      where: { barcode },
      relations: ['category'],
    });
  }

  async createItem(dto: Partial<WarehouseItem> & { categoryId?: number }, organizationId: number | null): Promise<WarehouseItem> {
    const barcode = dto.barcode || await this.generateBarcode();
    const existing = await this.itemsRepo.findOne({ where: { barcode } });
    if (existing) throw new ConflictException(`Barcode ${barcode} already in use`);
    return this.itemsRepo.save(this.itemsRepo.create({
      ...dto,
      barcode,
      category: dto.categoryId ? ({ id: dto.categoryId } as any) : undefined,
      organization: organizationId ? ({ id: organizationId } as any) : undefined,
    }));
  }

  async updateItem(id: number, dto: Partial<WarehouseItem> & { categoryId?: number }, organizationId: number | null): Promise<WarehouseItem> {
    const item = await this.itemsRepo.findOne({ where: { id }, relations: ['category', 'organization'] });
    if (!item) throw new NotFoundException('Item not found');
    if (organizationId != null && item.organization?.id !== organizationId) throw new NotFoundException('Item not found');
    Object.assign(item, {
      ...dto,
      category: dto.categoryId !== undefined ? ({ id: dto.categoryId } as any) : item.category,
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
}
