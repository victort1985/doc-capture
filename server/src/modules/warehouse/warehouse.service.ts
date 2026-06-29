import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { WarehouseCategory } from './entities/warehouse-category.entity';
import { WarehouseItem } from './entities/warehouse-item.entity';
import { WarehouseTransaction, TransactionType } from './entities/warehouse-transaction.entity';
import { WarehouseRepair } from './entities/warehouse-repair.entity';
import { WarehouseTransfer, TransferItemRecord } from './entities/warehouse-transfer.entity';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(WarehouseCategory) private readonly catsRepo: Repository<WarehouseCategory>,
    @InjectRepository(WarehouseItem) private readonly itemsRepo: Repository<WarehouseItem>,
    @InjectRepository(WarehouseTransaction) private readonly txRepo: Repository<WarehouseTransaction>,
    @InjectRepository(WarehouseRepair) private readonly repairsRepo: Repository<WarehouseRepair>,
    @InjectRepository(WarehouseTransfer) private readonly transfersRepo: Repository<WarehouseTransfer>,
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

  async findLocations(organizationId: number | null, q?: string): Promise<string[]> {
    const qb = this.itemsRepo.createQueryBuilder('item')
      .select('DISTINCT item.location', 'location')
      .where('item.location IS NOT NULL')
      .andWhere("item.location != ''");
    if (organizationId != null) {
      qb.andWhere('(item.organizationId = :orgId OR item.organizationId IS NULL)', { orgId: organizationId });
    }
    if (q?.trim()) {
      qb.andWhere('item.location ILIKE :q', { q: `%${q.trim()}%` });
    }
    qb.orderBy('item.location', 'ASC');
    const rows = await qb.getRawMany();
    return rows.map(r => r.location as string);
  }

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

  // ── Transfers ──────────────────────────────────────────────────────────────

  async listTransfers(organizationId: number | null): Promise<WarehouseTransfer[]> {
    const qb = this.transfersRepo.createQueryBuilder('t')
      .leftJoin('t.createdBy', 'u')
      .addSelect(['u.id', 'u.username'])
      .orderBy('t.createdAt', 'DESC');
    if (organizationId != null) {
      qb.where('t.organizationId = :orgId', { orgId: organizationId });
    }
    return qb.getMany();
  }

  async createTransfer(
    dto: { fromLocation?: string; toLocation?: string; items: TransferItemRecord[]; notes?: string },
    organizationId: number | null,
    userId: number,
  ): Promise<WarehouseTransfer> {
    const count = await this.transfersRepo.count();
    const noteNumber = `T-${String(count + 1).padStart(6, '0')}`;

    for (const rec of dto.items) {
      if (!rec.itemId || rec.quantity <= 0) continue;

      // Deduct from source item
      const srcItem = await this.itemsRepo.findOne({ where: { id: rec.itemId } });
      if (srcItem) {
        srcItem.quantity = Math.max(0, srcItem.quantity - rec.quantity);
        await this.itemsRepo.save(srcItem);
        await this.txRepo.save(this.txRepo.create({
          item: { id: srcItem.id } as any,
          type: TransactionType.OUT,
          quantity: rec.quantity,
          reason: `Transfer to: ${dto.toLocation ?? '—'}  [${noteNumber}]`,
          registeredBy: { id: userId } as any,
        }));
      }

      // Add to destination: find same-named item in toLocation, or create it
      if (dto.toLocation) {
        let destItem = await this.itemsRepo.findOne({
          where: { name: rec.name, location: dto.toLocation, organization: organizationId ? { id: organizationId } : undefined },
        });
        if (!destItem) {
          destItem = this.itemsRepo.create({
            name: rec.name,
            barcode: await this.generateBarcode(),
            location: dto.toLocation,
            quantity: 0,
            unit: srcItem?.unit,
            category: srcItem?.category,
            organization: organizationId ? ({ id: organizationId } as any) : undefined,
          });
        }
        destItem.quantity = (destItem.quantity ?? 0) + rec.quantity;
        await this.itemsRepo.save(destItem);
        await this.txRepo.save(this.txRepo.create({
          item: { id: destItem.id } as any,
          type: TransactionType.IN,
          quantity: rec.quantity,
          reason: `Transfer from: ${dto.fromLocation ?? '—'}  [${noteNumber}]`,
          registeredBy: { id: userId } as any,
        }));
      }
    }

    return this.transfersRepo.save(this.transfersRepo.create({
      noteNumber,
      fromLocation: dto.fromLocation,
      toLocation: dto.toLocation,
      items: dto.items,
      notes: dto.notes,
      createdBy: { id: userId } as any,
      organization: organizationId ? ({ id: organizationId } as any) : undefined,
    }));
  }

  async storeTransferPdf(id: number, base64Pdf: string): Promise<string> {
    const transfer = await this.transfersRepo.findOne({ where: { id } });
    if (!transfer) throw new NotFoundException('Transfer not found');
    const path = `/uploads/transfer-pdfs/${id}.pdf`;
    transfer.pdfPath = path;
    await this.transfersRepo.save(transfer);
    return path;
  }
}
