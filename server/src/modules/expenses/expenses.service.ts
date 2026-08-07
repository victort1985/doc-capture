import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from './entities/expense.entity';
import { SupplierInvoice } from './entities/supplier-invoice.entity';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { MarkSupplierInvoicePaidDto } from './dto/mark-supplier-invoice-paid.dto';
import { LedgerPostingService } from '../accounting/ledger-posting.service';
import { StorageService } from '../storage/storage.service';
import { writeMaybeEncrypted, readMaybeEncrypted } from '../../common/crypto/encrypted-storage.util';
import { PaymentMethod } from '../payments/entities/payment.entity';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(Expense) private readonly expensesRepo: Repository<Expense>,
    @InjectRepository(SupplierInvoice) private readonly supplierInvoicesRepo: Repository<SupplierInvoice>,
    private readonly ledgerPostingService: LedgerPostingService,
    private readonly storageService: StorageService,
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
      vatAmount: dto.vatAmount,
      method: dto.method ?? PaymentMethod.CASH,
      cardLast4: dto.cardLast4,
      cardType: dto.cardType,
      approvalNumber: dto.approvalNumber,
      installments: dto.installments,
      checkNumber: dto.checkNumber,
      bankName: dto.bankName,
      branchNumber: dto.branchNumber,
      accountNumber: dto.accountNumber,
      checkDate: dto.checkDate,
      referenceNumber: dto.referenceNumber,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    const saved = await this.expensesRepo.save(expense);

    if (organizationId != null) {
      try {
        await this.ledgerPostingService.postExpense(organizationId, saved.id, saved.date, saved.amount, saved.method, saved.description, saved.vatAmount);
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
      vatAmount: dto.vatAmount,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    const saved = await this.supplierInvoicesRepo.save(invoice);

    if (organizationId != null) {
      try {
        await this.ledgerPostingService.postSupplierInvoice(organizationId, saved.id, saved.date, saved.amount, saved.supplierName, saved.vatAmount);
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
  async markSupplierInvoicePaid(id: number, organizationId: number | null, dto: MarkSupplierInvoicePaidDto): Promise<SupplierInvoice> {
    const invoice = await this.supplierInvoicesRepo.findOne({ where: { id }, relations: ['organization'] });
    if (!invoice) throw new NotFoundException('Supplier invoice not found');
    if (organizationId != null && invoice.organization?.id !== organizationId) throw new NotFoundException('Supplier invoice not found');
    if (invoice.paidAt) throw new BadRequestException('This supplier invoice is already marked paid');

    const method = dto.method ?? PaymentMethod.CASH;
    invoice.paidAt = new Date();
    invoice.paidMethod = method;
    invoice.cardLast4 = dto.cardLast4;
    invoice.cardType = dto.cardType;
    invoice.approvalNumber = dto.approvalNumber;
    invoice.installments = dto.installments;
    invoice.checkNumber = dto.checkNumber;
    invoice.bankName = dto.bankName;
    invoice.branchNumber = dto.branchNumber;
    invoice.accountNumber = dto.accountNumber;
    invoice.checkDate = dto.checkDate;
    invoice.referenceNumber = dto.referenceNumber;
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

  // ── CSV import (requirement #14) ────────────────────────────────
  /** Minimal CSV parser (no external dependency) — handles quoted
   * fields with embedded commas/quotes, which is the one thing a
   * naive split(',') gets wrong. Doesn't handle embedded newlines
   * inside a quoted field; good enough for the flat, simple export
   * format this pairs with (see export.csv), not a general-purpose
   * CSV library replacement. */
  private parseCsv(text: string): Record<string, string>[] {
    const parseLine = (line: string): string[] => {
      const fields: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') { inQuotes = false; }
          else { cur += ch; }
        } else if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { fields.push(cur); cur = ''; }
        else { cur += ch; }
      }
      fields.push(cur);
      return fields.map((f) => f.trim());
    };

    const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    const headers = parseLine(lines[0]).map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const values = parseLine(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
      return row;
    });
  }

  /** Every row is processed independently and failures don't stop the
   * rest of the file — a bulk import is exactly the situation where
   * one malformed row (typo'd amount, missing required field)
   * shouldn't throw away everything else that parsed fine. Returns a
   * summary so the person doing the import can see what actually
   * happened, not just "it worked" or a stack trace. */
  async importExpensesCsv(organizationId: number | null, userId: number, csvText: string): Promise<{ imported: number; failed: { row: number; error: string }[] }> {
    const rows = this.parseCsv(csvText);
    let imported = 0;
    const failed: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const amount = Number(row.amount);
        if (!row.description) throw new Error('description is required');
        if (!Number.isFinite(amount) || amount <= 0) throw new Error(`invalid amount: "${row.amount}"`);
        const method = row.method === 'bank' ? PaymentMethod.BANK_TRANSFER : PaymentMethod.CASH;
        await this.createExpense(organizationId, userId, {
          date: row.date || undefined,
          description: row.description,
          category: row.category || undefined,
          amount,
          method,
        });
        imported++;
      } catch (e) {
        failed.push({ row: i + 2, error: e instanceof Error ? e.message : String(e) }); // +2: 1-indexed + header row
      }
    }
    return { imported, failed };
  }

  async importSupplierInvoicesCsv(organizationId: number | null, userId: number, csvText: string): Promise<{ imported: number; failed: { row: number; error: string }[] }> {
    const rows = this.parseCsv(csvText);
    let imported = 0;
    const failed: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const amount = Number(row.amount);
        if (!row.supplierName) throw new Error('supplierName is required');
        if (!Number.isFinite(amount) || amount <= 0) throw new Error(`invalid amount: "${row.amount}"`);
        await this.createSupplierInvoice(organizationId, userId, {
          supplierName: row.supplierName,
          invoiceNumber: row.invoiceNumber || undefined,
          date: row.date || undefined,
          dueDate: row.dueDate || undefined,
          description: row.description || undefined,
          amount,
        });
        imported++;
      } catch (e) {
        failed.push({ row: i + 2, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { imported, failed };
  }

  // ── Receipt / bill attachment ────────────────────────────────────
  /** Attaches a scanned receipt to an expense. Uses the same per-user
   * document storage connection every other scan/photo upload in this
   * app resolves through (see FleetService.addDocument for the
   * identical pattern), rather than a dedicated expenses-specific
   * connection — one less thing for an org to have to configure
   * separately. */
  async attachExpenseReceipt(id: number, organizationId: number | null, userId: number, file: { originalname: string; buffer: Buffer }): Promise<Expense> {
    const expense = await this.expensesRepo.findOne({ where: { id }, relations: ['organization'] });
    if (!expense) throw new NotFoundException('Expense not found');
    if (organizationId != null && expense.organization?.id !== organizationId) throw new NotFoundException('Expense not found');

    const settings = await this.storageService.getClientSettings(userId);
    const connectionId = settings?.documentStorageConnection?.id;
    if (!connectionId) throw new BadRequestException('No document storage connection configured for this user — set one under Storage settings first.');

    // Same sanitization orders.service.ts's writeOrderPdf already
    // applies to its own generated filenames — strips path-traversal
    // and filesystem-unsafe characters from anything derived from a
    // user-supplied name before it becomes part of a storage path.
    // Length-capped too: a real extension is never more than a few
    // characters.
    const rawExt = file.originalname.includes('.') ? file.originalname.slice(file.originalname.lastIndexOf('.')) : '.jpg';
    const ext = rawExt.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').slice(0, 10);
    const relativePath = `Expenses/${id}_${Date.now()}${ext}`;
    const { adapter, encryptAtRest } = await this.storageService.getAdapterWithMeta(connectionId);
    expense.receiptStoragePath = await writeMaybeEncrypted(adapter, relativePath, file.buffer, encryptAtRest);
    return this.expensesRepo.save(expense);
  }

  async getExpenseReceipt(id: number, organizationId: number | null, userId: number): Promise<Buffer> {
    const expense = await this.expensesRepo.findOne({ where: { id }, relations: ['organization'] });
    if (!expense?.receiptStoragePath) throw new NotFoundException('This expense has no receipt attached');
    if (organizationId != null && expense.organization?.id !== organizationId) throw new NotFoundException('Expense not found');

    const settings = await this.storageService.getClientSettings(userId);
    const connectionId = settings?.documentStorageConnection?.id;
    if (!connectionId) throw new NotFoundException('Storage connection is no longer configured');
    const { adapter } = await this.storageService.getAdapterWithMeta(connectionId);
    return readMaybeEncrypted(adapter, expense.receiptStoragePath);
  }

  async attachSupplierInvoiceBill(id: number, organizationId: number | null, userId: number, file: { originalname: string; buffer: Buffer }): Promise<SupplierInvoice> {
    const invoice = await this.supplierInvoicesRepo.findOne({ where: { id }, relations: ['organization'] });
    if (!invoice) throw new NotFoundException('Supplier invoice not found');
    if (organizationId != null && invoice.organization?.id !== organizationId) throw new NotFoundException('Supplier invoice not found');

    const settings = await this.storageService.getClientSettings(userId);
    const connectionId = settings?.documentStorageConnection?.id;
    if (!connectionId) throw new BadRequestException('No document storage connection configured for this user — set one under Storage settings first.');

    // See attachExpenseReceipt's identical comment above.
    const rawExt = file.originalname.includes('.') ? file.originalname.slice(file.originalname.lastIndexOf('.')) : '.pdf';
    const ext = rawExt.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').slice(0, 10);
    const relativePath = `SupplierInvoices/${id}_${Date.now()}${ext}`;
    const { adapter, encryptAtRest } = await this.storageService.getAdapterWithMeta(connectionId);
    invoice.storagePath = await writeMaybeEncrypted(adapter, relativePath, file.buffer, encryptAtRest);
    return this.supplierInvoicesRepo.save(invoice);
  }

  async getSupplierInvoiceBill(id: number, organizationId: number | null, userId: number): Promise<Buffer> {
    const invoice = await this.supplierInvoicesRepo.findOne({ where: { id }, relations: ['organization'] });
    if (!invoice?.storagePath) throw new NotFoundException('This supplier invoice has no bill attached');
    if (organizationId != null && invoice.organization?.id !== organizationId) throw new NotFoundException('Supplier invoice not found');

    const settings = await this.storageService.getClientSettings(userId);
    const connectionId = settings?.documentStorageConnection?.id;
    if (!connectionId) throw new NotFoundException('Storage connection is no longer configured');
    const { adapter } = await this.storageService.getAdapterWithMeta(connectionId);
    return readMaybeEncrypted(adapter, invoice.storagePath);
  }
}
