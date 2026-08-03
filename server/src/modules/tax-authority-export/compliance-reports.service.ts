import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { CreditNote } from '../credit-notes/entities/credit-note.entity';
import { DebitNote } from '../debit-notes/entities/debit-note.entity';
import { Payment } from '../payments/entities/payment.entity';
import { SupplierInvoice } from '../expenses/entities/supplier-invoice.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { ReturnNote } from '../returns/entities/return-note.entity';
import { LedgerEntry } from '../accounting/entities/ledger-entry.entity';
import { Account } from '../accounting/entities/account.entity';
import { WarehouseItem } from '../warehouse/entities/warehouse-item.entity';
import { TaxAuthoritySettings } from '../invoice-israel/entities/tax-authority-settings.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { DOCUMENT_TYPE_CODES } from './document-type-codes';

/** Appendix 1 (נספח מספר 1) of horaot_131.pdf — every document type
 * code and its Hebrew name, in the order the appendix itself lists
 * them. Section 2.6's own report must show EVERY one of these, with
 * 0/0 for any type this software doesn't manage — not omit the row
 * (see the instructions' own worked example and its footnote). */
const APPENDIX_1_DOCUMENT_TYPES: { code: number; name: string }[] = [
  { code: 100, name: 'הזמנה' },
  { code: 200, name: 'תעודת משלוח' },
  { code: 205, name: 'תעודת משלוח סוכן' },
  { code: 210, name: 'תעודת החזרה' },
  { code: 300, name: 'חשבונית/חשבונית עסקה' },
  { code: 305, name: 'חשבונית-מס' },
  { code: 310, name: 'חשבונית ריכוז' },
  { code: 320, name: 'חשבונית מס/קבלה' },
  { code: 330, name: 'חשבונית מס זיכוי' },
  { code: 340, name: 'חשבונית שריון' },
  { code: 345, name: 'חשבונית סוכן' },
  { code: 400, name: 'קבלה' },
  { code: 405, name: 'קבלה על תרומות' },
  { code: 410, name: 'יציאה מקופה' },
  { code: 420, name: 'הפקדת בנק' },
  { code: 500, name: 'הזמנת רכש' },
  { code: 600, name: 'תעודת משלוח רכש' },
  { code: 610, name: 'החזרת רכש' },
  { code: 700, name: 'חשבונית מס רכש' },
  { code: 710, name: 'זיכוי רכש' },
  { code: 800, name: 'יתרת פתיחה' },
  { code: 810, name: 'כניסה כללית למלאי' },
  { code: 820, name: 'יציאה כללית מהמלאי' },
  { code: 830, name: 'העברה בין מחסנים' },
  { code: 840, name: 'עדכון בעקבות ספירה' },
  { code: 900, name: 'דוח ייצור-כניסה' },
  { code: 910, name: 'דוח ייצור-יציאה' },
];

/** Record types (not to be confused with document TYPES above) as
 * listed in section 5.4/Appendix 4's own worked example table —
 * matches this export module's own record codes exactly (see
 * structural-records.ts / entity-mapping.ts). */
const RECORD_TYPE_NAMES: { code: string; name: string }[] = [
  { code: 'A100', name: 'רשומה פתיחה' },
  { code: '100B', name: 'תנועות בהנהלת חשבונות' },
  { code: '110B', name: 'חשבון בהנהלת חשבונות' },
  { code: 'C100', name: 'כותרת מסמך' },
  { code: 'D110', name: 'פרטי מסמך' },
  { code: 'D120', name: 'פרטי קבלות' },
  { code: 'M100', name: 'פריטים במלאי' },
  { code: 'Z900', name: 'רשומת סיום' },
];

export interface Section26Row { code: number; name: string; count: number; sum: number; }
export interface Section26Report { rows: Section26Row[]; trialBalance: { accountName: string; debit: number; credit: number }[]; }
export interface Section54Report {
  vatId: string;
  businessName: string;
  path: string;
  from: Date;
  to: Date;
  isMultiYear: boolean;
  taxYear?: number;
  recordCounts: { code: string; name: string; count: number }[];
  softwareName: string;
  softwareRegistrationNumber?: string;
  generatedAt: Date;
}

export interface GenerateComplianceOptions { organizationId: number; from: Date; to: Date; }

@Injectable()
export class ComplianceReportsService {
  constructor(
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(DeliveryNote) private readonly deliveryNotesRepo: Repository<DeliveryNote>,
    @InjectRepository(CreditNote) private readonly creditNotesRepo: Repository<CreditNote>,
    @InjectRepository(DebitNote) private readonly debitNotesRepo: Repository<DebitNote>,
    @InjectRepository(Payment) private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(SupplierInvoice) private readonly supplierInvoicesRepo: Repository<SupplierInvoice>,
    @InjectRepository(Expense) private readonly expensesRepo: Repository<Expense>,
    @InjectRepository(ReturnNote) private readonly returnNotesRepo: Repository<ReturnNote>,
    @InjectRepository(LedgerEntry) private readonly ledgerRepo: Repository<LedgerEntry>,
    @InjectRepository(Account) private readonly accountsRepo: Repository<Account>,
    @InjectRepository(WarehouseItem) private readonly itemsRepo: Repository<WarehouseItem>,
    @InjectRepository(TaxAuthoritySettings) private readonly settingsRepo: Repository<TaxAuthoritySettings>,
    @InjectRepository(Organization) private readonly orgsRepo: Repository<Organization>,
  ) {}

  private async countSum(
    repo: Repository<any>,
    amountColumn: string,
    organizationId: number,
    from: Date,
    to: Date,
  ): Promise<{ count: number; sum: number }> {
    const raw = await repo
      .createQueryBuilder('e')
      .leftJoin('e.organization', 'organization')
      .where('organization.id = :orgId', { orgId: organizationId })
      .andWhere('e.createdAt >= :from AND e.createdAt <= :to', { from, to })
      .select(`COUNT(*)`, 'count')
      .addSelect(`COALESCE(SUM(e."${amountColumn}"), 0)`, 'sum')
      .getRawOne();
    return { count: Number(raw?.count ?? 0), sum: Number(raw?.sum ?? 0) };
  }

  /** Section 2.6's own two-part requirement: (a) a trial balance for
   * software with a bookkeeping module, (b) a per-document-type
   * count+sum table for software with a document-generation module.
   * Vixor has both, so both parts are returned. */
  async getSection26Report(options: GenerateComplianceOptions): Promise<Section26Report> {
    const { organizationId, from, to } = options;

    const byType = new Map<number, { count: number; sum: number }>();
    const add = async (code: number, repo: Repository<any>, amountColumn: string | null) => {
      if (amountColumn == null) {
        const count = await repo
          .createQueryBuilder('e')
          .leftJoin('e.organization', 'organization')
          .where('organization.id = :orgId', { orgId: organizationId })
          .andWhere('e.createdAt >= :from AND e.createdAt <= :to', { from, to })
          .getCount();
        byType.set(code, { count, sum: 0 });
      } else {
        byType.set(code, await this.countSum(repo, amountColumn, organizationId, from, to));
      }
    };

    // Delivery notes and return notes are managed but carry no
    // amounts (see this module's own document-mapping precedent, and
    // the instructions' own worked example, which shows exactly this
    // combination for a real business — quantities without prices).
    await add(DOCUMENT_TYPE_CODES.TAX_INVOICE, this.invoicesRepo, 'total');
    await add(DOCUMENT_TYPE_CODES.DELIVERY_NOTE, this.deliveryNotesRepo, null);
    await add(DOCUMENT_TYPE_CODES.RETURN_NOTE, this.returnNotesRepo, null);
    await add(DOCUMENT_TYPE_CODES.CREDIT_INVOICE, this.creditNotesRepo, 'total');
    await add(DOCUMENT_TYPE_CODES.RECEIPT, this.paymentsRepo, 'amount');
    await add(DOCUMENT_TYPE_CODES.PURCHASE_TAX_INVOICE, this.supplierInvoicesRepo, 'amount');
    await add(DOCUMENT_TYPE_CODES.CASH_OUT, this.expensesRepo, 'amount');

    // DebitNote maps onto the same 305 code as Invoice (see
    // entity-mapping.ts's own DOCUMENT_TYPE_CODES.TAX_INVOICE usage
    // for debit notes) — merge its count/sum into that same row
    // rather than overwriting it, since both genuinely share one
    // document-type code in this format.
    const debitStats = await this.countSum(this.debitNotesRepo, 'total', organizationId, from, to);
    const existing = byType.get(DOCUMENT_TYPE_CODES.TAX_INVOICE) ?? { count: 0, sum: 0 };
    byType.set(DOCUMENT_TYPE_CODES.TAX_INVOICE, { count: existing.count + debitStats.count, sum: existing.sum + debitStats.sum });

    const rows: Section26Row[] = APPENDIX_1_DOCUMENT_TYPES.map(({ code, name }) => {
      const stats = byType.get(code);
      return { code, name, count: stats?.count ?? 0, sum: stats?.sum ?? 0 };
    });

    // Trial balance: per-account debit/credit totals across every
    // ledger entry in range — same aggregation open-format-export
    // already does per account, reused here for the printed report.
    const ledgerEntries = await this.ledgerRepo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.debitAccount', 'debitAccount')
      .leftJoinAndSelect('entry.creditAccount', 'creditAccount')
      .leftJoin('entry.organization', 'organization')
      .where('organization.id = :orgId', { orgId: organizationId })
      .andWhere('entry.date >= :from AND entry.date <= :to', { from, to })
      .getMany();
    const accountIds = new Set<number>();
    for (const e of ledgerEntries) { accountIds.add(e.debitAccount.id); accountIds.add(e.creditAccount.id); }
    const trialBalance = Array.from(accountIds).map((id) => {
      const account = ledgerEntries.find((e) => e.debitAccount.id === id)?.debitAccount
        ?? ledgerEntries.find((e) => e.creditAccount.id === id)?.creditAccount;
      const debit = ledgerEntries.filter((e) => e.debitAccount.id === id).reduce((s, e) => s + e.amount, 0);
      const credit = ledgerEntries.filter((e) => e.creditAccount.id === id).reduce((s, e) => s + e.amount, 0);
      return { accountName: account?.name ?? `#${id}`, debit, credit };
    });

    return { rows, trialBalance };
  }

  /** Appendix 4 (section 5.4) — the printed confirmation screen shown
   * right after file generation, per the instructions' own template:
   * business identity, the OPENFRMT path convention, date/year range,
   * a record-type count table (reusing the SAME record codes this
   * module already tracks for the INI summary — see
   * open-format-export.service.ts's own typeCounts), and software
   * identity. */
  async getSection54Report(options: GenerateComplianceOptions): Promise<Section54Report> {
    const { organizationId, from, to } = options;
    const settings = await this.settingsRepo.findOne({ where: { organization: { id: organizationId } } });
    if (!settings?.vatNumber) {
      throw new NotFoundException('No VAT number configured — set one under the Invoice Israel integration settings first.');
    }
    const org = await this.orgsRepo.findOne({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');

    const vatId8 = settings.vatNumber.slice(0, 8);
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mmddhhmm = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const path = `X:\\OPENFRMT\\${vatId8}.${yy}\\${mmddhhmm}`;

    const countFor = (repo: Repository<any>) =>
      repo
        .createQueryBuilder('e')
        .leftJoin('e.organization', 'organization')
        .where('organization.id = :orgId', { orgId: organizationId })
        .andWhere('e.createdAt >= :from AND e.createdAt <= :to', { from, to })
        .getCount();

    const [invoiceCount, deliveryCount, creditCount, debitCount, paymentCount, supplierCount, expenseCount, returnCount, itemCount] =
      await Promise.all([
        countFor(this.invoicesRepo), countFor(this.deliveryNotesRepo), countFor(this.creditNotesRepo),
        countFor(this.debitNotesRepo), countFor(this.paymentsRepo), countFor(this.supplierInvoicesRepo),
        countFor(this.expensesRepo), countFor(this.returnNotesRepo),
        this.itemsRepo.count({ where: { organization: { id: organizationId } } }),
      ]);
    const c100Count = invoiceCount + deliveryCount + creditCount + debitCount + paymentCount + supplierCount + expenseCount + returnCount;
    const d110Count = invoiceCount + deliveryCount + creditCount + debitCount + supplierCount + returnCount; // header docs whose lines are 110D
    const d120Count = paymentCount + expenseCount; // header docs whose lines are 120D

    const ledgerEntries = await this.ledgerRepo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.debitAccount', 'debitAccount')
      .leftJoinAndSelect('entry.creditAccount', 'creditAccount')
      .leftJoin('entry.organization', 'organization')
      .where('organization.id = :orgId', { orgId: organizationId })
      .andWhere('entry.date >= :from AND entry.date <= :to', { from, to })
      .getMany();
    const accountIds = new Set<number>();
    for (const e of ledgerEntries) { accountIds.add(e.debitAccount.id); accountIds.add(e.creditAccount.id); }

    const counts: Record<string, number> = {
      A100: 1,
      '100B': ledgerEntries.length,
      '110B': accountIds.size,
      C100: c100Count,
      D110: d110Count,
      D120: d120Count,
      M100: itemCount,
      Z900: 1,
    };

    return {
      vatId: settings.vatNumber,
      businessName: org.name,
      path,
      from,
      to,
      isMultiYear: true,
      recordCounts: RECORD_TYPE_NAMES.map(({ code, name }) => ({ code, name, count: counts[code] ?? 0 })),
      softwareName: 'Vixor ERP',
      softwareRegistrationNumber: settings.softwareRegistrationNumber ?? undefined,
      generatedAt: now,
    };
  }
}
