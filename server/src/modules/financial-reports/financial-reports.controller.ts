import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceSettings } from '../invoices/entities/invoice-settings.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { Payment } from '../payments/entities/payment.entity';
import { CreditNote } from '../credit-notes/entities/credit-note.entity';
import { DebitNote } from '../debit-notes/entities/debit-note.entity';
import { SupplierInvoice } from '../expenses/entities/supplier-invoice.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { VAT_RATE } from '../documents/document-pdf.util';

type ReqUser = { id: number; organizationId: number | null };

/**
 * Accountant-facing summary for a date range: revenue billed
 * (invoices), VAT on that revenue, actual cash received (payments,
 * broken down by method for bank-reconciliation purposes), and
 * outstanding invoices (issued but with no payment recorded yet in
 * the same chain). Deliberately period-agnostic here — month/
 * quarter/half-year/year/custom are all just a from/to range computed
 * by the caller, so there's exactly one aggregation path to keep
 * correct rather than several slightly-different ones.
 */
@Controller('financial-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class FinancialReportsController {
  constructor(
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(InvoiceSettings) private readonly invoiceSettingsRepo: Repository<InvoiceSettings>,
    @InjectRepository(Quote) private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(Payment) private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(CreditNote) private readonly creditNotesRepo: Repository<CreditNote>,
    @InjectRepository(DebitNote) private readonly debitNotesRepo: Repository<DebitNote>,
    @InjectRepository(SupplierInvoice) private readonly supplierInvoicesRepo: Repository<SupplierInvoice>,
  ) {}

  /** Shared by summary() and aging() rather than duplicated, matching
   * this controller's own stated philosophy ("exactly one aggregation
   * path to keep correct"). An invoice counts as settled — excluded
   * from "outstanding" — if EITHER a payment shares its chainId (the
   * existing check) OR credit notes issued against it (by invoiceId,
   * a separate correlation mechanism from chainId — see
   * CreditNote.invoiceId) cover its full total. A real gap found
   * while investigating a report that showed the full original total
   * as still owed on invoices that had ALSO been fully credited —
   * credit notes were never checked here at all before this, only
   * payments were. A PARTIAL credit note (less than the invoice's
   * full total) does NOT excuse the invoice from "outstanding" —
   * there's still a genuine remaining balance in that case, so this
   * only excludes invoices whose credited total actually covers what
   * was billed. */
  private async getOutstandingInvoices(invoices: Invoice[]): Promise<Invoice[]> {
    const chainIds = invoices.map((i) => i.chainId).filter((id): id is string => !!id);
    const paidChainIdSet = chainIds.length
      ? new Set(
          (
            await this.paymentsRepo
              .createQueryBuilder('p')
              .select('DISTINCT p.chainId', 'chainId')
              .where('p.chainId IN (:...ids)', { ids: chainIds })
              .getRawMany<{ chainId: string }>()
          ).map((r) => r.chainId),
        )
      : new Set<string>();

    const invoiceIds = invoices.map((i) => i.id);
    const creditedTotalByInvoiceId = new Map<number, number>();
    if (invoiceIds.length) {
      const creditRows = await this.creditNotesRepo
        .createQueryBuilder('cn')
        .select('cn.invoiceId', 'invoiceId')
        .addSelect('SUM(cn.total)', 'total')
        .where('cn.invoiceId IN (:...ids)', { ids: invoiceIds })
        .groupBy('cn.invoiceId')
        .getRawMany<{ invoiceId: number; total: string }>();
      for (const row of creditRows) creditedTotalByInvoiceId.set(row.invoiceId, Number(row.total));
    }

    return invoices.filter((i) => {
      const paidViaChain = !!i.chainId && paidChainIdSet.has(i.chainId);
      const creditedTotal = creditedTotalByInvoiceId.get(i.id) ?? 0;
      const fullyCredited = creditedTotal >= Number(i.total) - 0.01; // tolerance for floating-point cents
      return !paidViaChain && !fullyCredited;
    });
  }

  @Get()
  async summary(
    @CurrentUser() user: ReqUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('orgId') orgIdParam?: string,
  ) {
    // Super-admins may request a specific org's report; scoped admins
    // are always confined to their own org regardless of what's asked.
    const organizationId = user.organizationId ?? (orgIdParam ? Number(orgIdParam) : null);
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};

    const [invoices, quotesCount, payments, invoiceSettings] = await Promise.all([
      this.invoicesRepo.find({ where: { ...orgFilter, date: Between(from, to) } as any }),
      this.quotesRepo.count({ where: { ...orgFilter, date: Between(from, to) } as any }),
      this.paymentsRepo.find({ where: { ...orgFilter, date: Between(from, to) } as any }),
      organizationId != null ? this.invoiceSettingsRepo.findOne({ where: { organization: { id: organizationId } } }) : null,
    ]);

    const vatEnabled = invoiceSettings?.vatEnabled ?? true;
    const revenueSubtotal = invoices.reduce((sum, inv) => sum + Number(inv.total), 0);
    const vatAmount = vatEnabled ? revenueSubtotal * VAT_RATE : 0;
    const revenueTotal = revenueSubtotal + vatAmount;

    const paymentsTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const paymentsByMethod: Record<string, { count: number; total: number }> = {};
    for (const p of payments) {
      paymentsByMethod[p.method] ??= { count: 0, total: 0 };
      paymentsByMethod[p.method].count += 1;
      paymentsByMethod[p.method].total += Number(p.amount);
    }

    // Outstanding = invoiced in this window but not yet settled by
    // either a payment or a covering credit note (regardless of when
    // that settlement itself was recorded — an invoice from the end
    // of the period may only get paid/credited weeks later, which is
    // exactly what "outstanding" is supposed to catch).
    const outstanding = await this.getOutstandingInvoices(invoices);

    return {
      period: { from, to },
      vatEnabled,
      revenue: {
        subtotal: round2(revenueSubtotal),
        vat: round2(vatAmount),
        total: round2(revenueTotal),
      },
      payments: {
        total: round2(paymentsTotal),
        count: payments.length,
        byMethod: Object.fromEntries(Object.entries(paymentsByMethod).map(([k, v]) => [k, { count: v.count, total: round2(v.total) }])),
      },
      outstandingInvoices: {
        count: outstanding.length,
        total: round2(outstanding.reduce((sum, i) => sum + Number(i.total), 0)),
      },
      documentCounts: {
        quotes: quotesCount,
        invoices: invoices.length,
        payments: payments.length,
      },
    };
  }

  /** "Возраст долгов" (requirement #13) — every currently-unpaid
   * invoice (no payment anywhere in its chain), regardless of when it
   * was issued, bucketed by days overdue. Deliberately NOT scoped to
   * the from/to range summary() uses - an invoice from six months ago
   * that's still unpaid is exactly what this report exists to surface. */
  @Get('aging')
  async aging(@CurrentUser() user: ReqUser, @Query('orgId') orgIdParam?: string) {
    const organizationId = user.organizationId ?? (orgIdParam ? Number(orgIdParam) : null);
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};

    const invoices = await this.invoicesRepo.find({ where: orgFilter as any });
    const outstanding = await this.getOutstandingInvoices(invoices);

    const today = new Date();
    const buckets = { current: [] as typeof outstanding, days30: [] as typeof outstanding, days60: [] as typeof outstanding, days90: [] as typeof outstanding, over90: [] as typeof outstanding };
    for (const inv of outstanding) {
      const issued = inv.date ? new Date(inv.date) : new Date(inv.createdAt);
      const daysOverdue = Math.floor((today.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24));
      if (daysOverdue <= 30) buckets.current.push(inv);
      else if (daysOverdue <= 60) buckets.days30.push(inv);
      else if (daysOverdue <= 90) buckets.days60.push(inv);
      else if (daysOverdue <= 120) buckets.days90.push(inv);
      else buckets.over90.push(inv);
    }

    const summarize = (list: typeof outstanding) => ({
      count: list.length,
      total: round2(list.reduce((sum, i) => sum + Number(i.total), 0)),
      invoices: list.map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, clientName: i.clientName, date: i.date, total: Number(i.total) })),
    });

    return {
      current: summarize(buckets.current),
      days31to60: summarize(buckets.days30),
      days61to90: summarize(buckets.days60),
      days91to120: summarize(buckets.days90),
      over120: summarize(buckets.over90),
      totalOutstanding: round2(outstanding.reduce((sum, i) => sum + Number(i.total), 0)),
    };
  }

  /** Requirement #14 ("Excel/CSV") — one row per invoice in the period,
   * for dropping straight into Excel/accounting software. UTF-8 BOM
   * prefix so Excel (which otherwise guesses the wrong encoding for
   * non-ASCII text, e.g. Hebrew client names) opens it correctly
   * without the person having to know to re-import with the right
   * encoding manually. */
  @Get('export.csv')
  async exportCsv(
    @CurrentUser() user: ReqUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('orgId') orgIdParam: string | undefined,
    @Res() res: Response,
  ) {
    const organizationId = user.organizationId ?? (orgIdParam ? Number(orgIdParam) : null);
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};
    const invoices = await this.invoicesRepo.find({ where: { ...orgFilter, date: Between(from, to) } as any, order: { date: 'ASC' } });

    const escapeCsv = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Invoice #', 'Date', 'Client', 'Client Email', 'Total', 'Status'];
    const rows = invoices.map((i) => [i.invoiceNumber ?? i.id, i.date ?? '', i.clientName, i.clientEmail ?? '', Number(i.total).toFixed(2), i.status]);
    const csv = [header, ...rows].map((r) => r.map(escapeCsv).join(',')).join('\r\n');

    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="invoices_${from}_${to}.csv"`,
    });
    res.send('\uFEFF' + csv);
  }

  /** Requirement #14 ("XML") — includes line items per invoice
   * (unlike export.csv's flat summary row), since XML is typically
   * asked for when handing data to another accounting system rather
   * than for a human to open directly, and a system-to-system import
   * needs the actual items, not just totals. */
  @Get('export.xml')
  async exportXml(
    @CurrentUser() user: ReqUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('orgId') orgIdParam: string | undefined,
    @Res() res: Response,
  ) {
    const organizationId = user.organizationId ?? (orgIdParam ? Number(orgIdParam) : null);
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};
    const invoices = await this.invoicesRepo.find({ where: { ...orgFilter, date: Between(from, to) } as any, order: { date: 'ASC' } });

    const escapeXml = (v: unknown) =>
      String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const invoicesXml = invoices
      .map((i) => {
        const itemsXml = (i.items ?? [])
          .map(
            (item: { description: string; quantity: number; unitPrice: number }) => `    <Item>
      <Description>${escapeXml(item.description)}</Description>
      <Quantity>${item.quantity}</Quantity>
      <UnitPrice>${item.unitPrice.toFixed(2)}</UnitPrice>
    </Item>`,
          )
          .join('\n');
        return `  <Invoice>
    <Number>${escapeXml(i.invoiceNumber ?? i.id)}</Number>
    <Date>${escapeXml(i.date ?? '')}</Date>
    <ClientName>${escapeXml(i.clientName)}</ClientName>
    <ClientEmail>${escapeXml(i.clientEmail ?? '')}</ClientEmail>
    <Total>${Number(i.total).toFixed(2)}</Total>
    <Status>${escapeXml(i.status)}</Status>
    <Items>
${itemsXml}
    </Items>
  </Invoice>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoices from="${from}" to="${to}">
${invoicesXml}
</Invoices>`;

    res.set({
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="invoices_${from}_${to}.xml"`,
    });
    res.send(xml);
  }

  /** Взаиморасчёты (requirement #7) — per-client running balance:
   * everything invoiced minus everything paid, all-time (not
   * period-scoped, same reasoning as the aging report — a client's
   * running balance doesn't reset at an arbitrary date boundary).
   *
   * Grouped by clientName string, not a proper foreign key — this
   * app doesn't link invoices/payments to a phonebook contact record
   * currently, so two invoices for "Yossi Cohen" and "יוסי כהן" (same
   * person, different spelling) would show as two separate rows here.
   * Good enough for a quick balance check, not a substitute for
   * cross-referencing against the actual client list for anything
   * that needs to be precise. */
  /** Balance owed per client, for every document type that actually
   * affects it — invoices and debit notes increase what's owed,
   * credit notes and payments decrease it, matching AR's own debit/
   * credit convention in the double-entry ledger (see
   * LedgerPostingService). Previously only counted invoices and
   * payments, silently missing credit/debit notes entirely — a fully-
   * credited invoice would have shown as fully outstanding here even
   * though it isn't (found and left unfixed while building the
   * client-ledger feature, which got this right from the start —
   * fixed now to bring this report in line with that one, since they
   * should never disagree about the same balance). */
  @Get('mutual-settlements')
  async mutualSettlements(@CurrentUser() user: ReqUser, @Query('orgId') orgIdParam?: string) {
    const organizationId = user.organizationId ?? (orgIdParam ? Number(orgIdParam) : null);
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};

    const [invoices, payments, creditNotes, debitNotes] = await Promise.all([
      this.invoicesRepo.find({ where: orgFilter as any }),
      this.paymentsRepo.find({ where: orgFilter as any }),
      this.creditNotesRepo.find({ where: orgFilter as any }),
      this.debitNotesRepo.find({ where: orgFilter as any }),
    ]);

    const byClient = new Map<string, { invoiced: number; paid: number }>();
    for (const inv of invoices) {
      const key = inv.clientName;
      const entry = byClient.get(key) ?? { invoiced: 0, paid: 0 };
      entry.invoiced += Number(inv.total);
      byClient.set(key, entry);
    }
    for (const dn of debitNotes) {
      const key = dn.clientName;
      const entry = byClient.get(key) ?? { invoiced: 0, paid: 0 };
      entry.invoiced += Number(dn.total);
      byClient.set(key, entry);
    }
    for (const p of payments) {
      const key = p.clientName;
      const entry = byClient.get(key) ?? { invoiced: 0, paid: 0 };
      entry.paid += Number(p.amount);
      byClient.set(key, entry);
    }
    for (const cn of creditNotes) {
      const key = cn.clientName;
      const entry = byClient.get(key) ?? { invoiced: 0, paid: 0 };
      entry.paid += Number(cn.total);
      byClient.set(key, entry);
    }

    return Array.from(byClient.entries())
      .map(([clientName, v]) => ({
        clientName,
        invoiced: round2(v.invoiced),
        paid: round2(v.paid),
        balance: round2(v.invoiced - v.paid),
      }))
      .sort((a, b) => b.balance - a.balance);
  }

  /** Distinct client/supplier names for the ledger-card picker below
   * — same string-matching approach mutual-settlements already uses
   * (clientName/supplierName aren't linked by a contact id across
   * every document type, only SupplierInvoice has one), so this stays
   * consistent with how the rest of the app already treats "who is
   * this contact" rather than introducing a second, different
   * grouping rule. */
  @Get('contacts')
  async contacts(@CurrentUser() user: ReqUser, @Query('type') type: 'client' | 'supplier', @Query('orgId') orgIdParam?: string) {
    const organizationId = user.organizationId ?? (orgIdParam ? Number(orgIdParam) : null);
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};
    if (type === 'supplier') {
      const rows = await this.supplierInvoicesRepo.find({ where: orgFilter as any, select: ['supplierName'] });
      return Array.from(new Set(rows.map((r) => r.supplierName))).sort();
    }
    const rows = await this.invoicesRepo.find({ where: orgFilter as any, select: ['clientName'] });
    return Array.from(new Set(rows.map((r) => r.clientName))).sort();
  }

  /** Client ledger card (כרטסת לקוח) — every document that ever moved
   * this client's balance, in chronological order with a running
   * total, going beyond mutual-settlements' own invoice-and-payment-
   * only summary (that report's own bug: it never accounted for
   * credit/debit notes at all, so a fully-credited invoice still
   * showed as fully owed there — this card gets it right by including
   * every document type that actually affects the balance). Invoices
   * and debit notes increase what the client owes; credit notes and
   * payments decrease it — matches AR's own debit/credit convention
   * in the double-entry ledger (see LedgerPostingService), just
   * presented per-contact instead of per-account. */
  @Get('client-ledger')
  async clientLedger(@CurrentUser() user: ReqUser, @Query('clientName') clientName: string, @Query('orgId') orgIdParam?: string) {
    const organizationId = user.organizationId ?? (orgIdParam ? Number(orgIdParam) : null);
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};

    const [invoices, creditNotes, debitNotes, payments] = await Promise.all([
      this.invoicesRepo.find({ where: { ...orgFilter, clientName } as any }),
      this.creditNotesRepo.find({ where: { ...orgFilter, clientName } as any }),
      this.debitNotesRepo.find({ where: { ...orgFilter, clientName } as any }),
      this.paymentsRepo.find({ where: { ...orgFilter, clientName } as any }),
    ]);

    type Entry = { date: string; type: string; documentNumber: string; debit: number; credit: number };
    const entries: Entry[] = [
      ...invoices.map((d) => ({ date: d.date ?? d.createdAt.toISOString().slice(0, 10), type: 'invoice', documentNumber: d.invoiceNumber ?? `#${d.id}`, debit: Number(d.total), credit: 0 })),
      ...debitNotes.map((d) => ({ date: d.date ?? d.createdAt.toISOString().slice(0, 10), type: 'debit-note', documentNumber: (d as any).debitNoteNumber ?? `#${d.id}`, debit: Number(d.total), credit: 0 })),
      ...creditNotes.map((d) => ({ date: d.date ?? d.createdAt.toISOString().slice(0, 10), type: 'credit-note', documentNumber: (d as any).creditNoteNumber ?? `#${d.id}`, debit: 0, credit: Number(d.total) })),
      ...payments.map((d) => ({ date: d.date ?? d.createdAt.toISOString().slice(0, 10), type: 'payment', documentNumber: (d as any).paymentNumber ?? `#${d.id}`, debit: 0, credit: Number(d.amount) })),
    ].sort((a, b) => a.date.localeCompare(b.date));

    let running = 0;
    const rows = entries.map((e) => {
      running = round2(running + e.debit - e.credit);
      return { ...e, debit: round2(e.debit), credit: round2(e.credit), balance: running };
    });

    return { clientName, rows, closingBalance: running };
  }

  /** Supplier ledger card (כרטסת ספק) — same idea as client-ledger,
   * but suppliers only ever have one document type (SupplierInvoice)
   * rather than a separate Payment entity: each invoice is its own
   * debit when issued, and — since there's no separate "supplier
   * payment" record, just a paidAt timestamp on the invoice itself
   * (see SupplierInvoice's own doc comment) — a paid invoice shows a
   * second, credit line on its paidAt date rather than a whole other
   * document type to join against. */
  @Get('supplier-ledger')
  async supplierLedger(@CurrentUser() user: ReqUser, @Query('supplierName') supplierName: string, @Query('orgId') orgIdParam?: string) {
    const organizationId = user.organizationId ?? (orgIdParam ? Number(orgIdParam) : null);
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};

    const invoices = await this.supplierInvoicesRepo.find({ where: { ...orgFilter, supplierName } as any });

    type Entry = { date: string; type: string; documentNumber: string; debit: number; credit: number };
    const entries: Entry[] = [];
    for (const inv of invoices) {
      entries.push({
        date: inv.date ? new Date(inv.date).toISOString().slice(0, 10) : inv.createdAt.toISOString().slice(0, 10),
        type: 'supplier-invoice', documentNumber: inv.invoiceNumber ?? `#${inv.id}`, debit: Number(inv.amount), credit: 0,
      });
      if (inv.paidAt) {
        entries.push({
          date: inv.paidAt.toISOString().slice(0, 10),
          type: 'supplier-payment', documentNumber: inv.invoiceNumber ?? `#${inv.id}`, debit: 0, credit: Number(inv.amount),
        });
      }
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));

    let running = 0;
    const rows = entries.map((e) => {
      running = round2(running + e.debit - e.credit);
      return { ...e, debit: round2(e.debit), credit: round2(e.credit), balance: running };
    });

    return { supplierName, rows, closingBalance: running };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
