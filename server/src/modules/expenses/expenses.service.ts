import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity';
import { SupplierInvoice } from './entities/supplier-invoice.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { LedgerPostingService } from '../accounting/ledger-posting.service';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense) private readonly expensesRepo: Repository<Expense>,
    @InjectRepository(SupplierInvoice) private readonly supplierInvoicesRepo: Repository<SupplierInvoice>,
    private readonly ledgerPostingService: LedgerPostingService,
  ) {}

  // ── Expenses ──────────────────────────────────────────────────
  async findAllExpenses(organizationId: number | null): Promise<Expense[]> {
    return this.expensesRepo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { date: 'DESC' },
    });
  }

  async createExpense(organizationId: number | null, userId: number, dto: CreateExpenseDto): Promise<Expense> {
    const expense = this.expensesRepo.create({
      date: dto.date ?? new Date().toISOString().slice(0, 10),
      description: dto.description,
      category: dto.category,
      amount: dto.amount,
      method: dto.method ?? 'cash',
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    const saved = await this.expensesRepo.save(expense);

    if (organizationId != null) {
      try {
        await this.ledgerPostingService.postExpense(organizationId, saved.id, saved.date, saved.amount, saved.method, saved.description);
      } catch {
        // best-effort — a bookkeeping hiccup must never block recording the expense itself
      }
    }
    return saved;
  }

  // ── Supplier invoices ─────────────────────────────────────────
  async findAllSupplierInvoices(organizationId: number | null): Promise<SupplierInvoice[]> {
    return this.supplierInvoicesRepo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { date: 'DESC' },
    });
  }

  async createSupplierInvoice(organizationId: number | null, userId: number, dto: CreateSupplierInvoiceDto): Promise<SupplierInvoice> {
    const invoice = this.supplierInvoicesRepo.create({
      supplierName: dto.supplierName,
      supplierContactId: dto.supplierContactId,
      invoiceNumber: dto.invoiceNumber,
      date: dto.date ?? new Date().toISOString().slice(0, 10),
      dueDate: dto.dueDate,
      description: dto.description,
      amount: dto.amount,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    const saved = await this.supplierInvoicesRepo.save(invoice);

    if (organizationId != null) {
      try {
        await this.ledgerPostingService.postSupplierInvoice(organizationId, saved.id, saved.date, saved.amount, saved.supplierName);
      } catch {
        // best-effort
      }
    }
    return saved;
  }

  /** Marks a supplier invoice paid and posts the corresponding
   * Accounts Payable -> Cash/Bank entry. Idempotent at the ledger
   * level (postEntry() checks sourceType+sourceId), but this method
   * itself still guards against marking an already-paid invoice paid
   * again, since that's a genuine user-facing mistake to prevent, not
   * just a retry to no-op. */
  async markSupplierInvoicePaid(id: number, organizationId: number | null, method: 'cash' | 'bank'): Promise<SupplierInvoice> {
    const invoice = await this.supplierInvoicesRepo.findOne({ where: { id }, relations: ['organization'] });
    if (!invoice) throw new NotFoundException('Supplier invoice not found');
    if (organizationId != null && invoice.organization?.id !== organizationId) throw new NotFoundException('Supplier invoice not found');
    if (invoice.paidAt) throw new BadRequestException('This supplier invoice is already marked paid');

    invoice.paidAt = new Date();
    const saved = await this.supplierInvoicesRepo.save(invoice);

    if (organizationId != null) {
      try {
        await this.ledgerPostingService.postSupplierPayment(organizationId, saved.id, new Date().toISOString().slice(0, 10), saved.amount, method, saved.supplierName);
      } catch {
        // best-effort
      }
    }
    return saved;
  }
}
