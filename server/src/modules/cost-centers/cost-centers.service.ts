import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CostCenter } from './entities/cost-center.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { SupplierInvoice } from '../expenses/entities/supplier-invoice.entity';
import { Invoice } from '../invoices/entities/invoice.entity';

export interface CostCenterReportRow {
  costCenterId: number | null;
  costCenterName: string;
  expenses: number;
  supplierInvoices: number;
  revenue: number;
  net: number;
}

@Injectable()
export class CostCentersService {
  constructor(
    @InjectRepository(CostCenter) private readonly repo: Repository<CostCenter>,
    @InjectRepository(Expense) private readonly expensesRepo: Repository<Expense>,
    @InjectRepository(SupplierInvoice) private readonly supplierInvoicesRepo: Repository<SupplierInvoice>,
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
  ) {}

  async findAll(organizationId: number | null): Promise<CostCenter[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { name: 'ASC' },
    });
  }

  async create(organizationId: number | null, name: string): Promise<CostCenter> {
    return this.repo.save(this.repo.create({
      name,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
    }));
  }

  private async findScoped(id: number, organizationId: number | null): Promise<CostCenter> {
    const cc = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!cc) throw new NotFoundException('Cost center not found');
    if (organizationId != null && cc.organization?.id !== organizationId) throw new NotFoundException('Cost center not found');
    return cc;
  }

  async rename(id: number, organizationId: number | null, name: string): Promise<CostCenter> {
    const cc = await this.findScoped(id, organizationId);
    cc.name = name;
    return this.repo.save(cc);
  }

  async remove(id: number, organizationId: number | null): Promise<void> {
    const cc = await this.findScoped(id, organizationId);
    await this.repo.remove(cc);
  }

  /** Spend and revenue attributed to each cost center for a period —
   * plus an "Unassigned" row for everything with no cost center set,
   * so the totals here always reconcile with the org-wide P&L rather
   * than silently dropping untagged documents. Revenue uses each
   * invoice's own `total` (matches the P&L's own revenue figure);
   * expenses/supplier invoices use the full amount as recorded (VAT-
   * inclusive, matching how those documents are entered) — this is a
   * spend-attribution view, not a restatement of the VAT-tracking
   * work elsewhere. */
  async getReport(organizationId: number | null, from: string, to: string): Promise<CostCenterReportRow[]> {
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};
    const [centers, expenses, supplierInvoices, invoices] = await Promise.all([
      this.repo.find({ where: orgFilter as any }),
      this.expensesRepo.find({ where: orgFilter as any, relations: ['costCenter'] }),
      this.supplierInvoicesRepo.find({ where: orgFilter as any, relations: ['costCenter'] }),
      this.invoicesRepo.find({ where: orgFilter as any, relations: ['costCenter'] }),
    ]);

    const inRange = (dateStr: string | undefined | null) => {
      if (!dateStr) return false;
      return dateStr >= from && dateStr <= to;
    };

    const byId = new Map<number | null, CostCenterReportRow>();
    const getRow = (cc: CostCenter | null | undefined): CostCenterReportRow => {
      const key = cc?.id ?? null;
      if (!byId.has(key)) {
        byId.set(key, { costCenterId: key, costCenterName: cc?.name ?? 'Unassigned', expenses: 0, supplierInvoices: 0, revenue: 0, net: 0 });
      }
      return byId.get(key)!;
    };

    for (const cc of centers) getRow(cc); // ensure every center appears even with zero activity

    for (const e of expenses) {
      if (!inRange(e.date)) continue;
      getRow(e.costCenter).expenses += Number(e.amount);
    }
    for (const si of supplierInvoices) {
      if (!inRange(si.date ? new Date(si.date).toISOString().slice(0, 10) : null)) continue;
      getRow(si.costCenter).supplierInvoices += Number(si.amount);
    }
    for (const inv of invoices) {
      if (!inRange(inv.date)) continue;
      getRow(inv.costCenter).revenue += Number(inv.total);
    }

    const rows = Array.from(byId.values());
    for (const r of rows) {
      r.expenses = Math.round(r.expenses * 100) / 100;
      r.supplierInvoices = Math.round(r.supplierInvoices * 100) / 100;
      r.revenue = Math.round(r.revenue * 100) / 100;
      r.net = Math.round((r.revenue - r.expenses - r.supplierInvoices) * 100) / 100;
    }
    return rows.sort((a, b) => (a.costCenterId === null ? 1 : b.costCenterId === null ? -1 : a.costCenterName.localeCompare(b.costCenterName)));
  }
}
