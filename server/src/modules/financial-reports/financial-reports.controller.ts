import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceSettings } from '../invoices/entities/invoice-settings.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { Payment } from '../payments/entities/payment.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
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
@UseGuards(JwtAuthGuard)
export class FinancialReportsController {
  constructor(
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(InvoiceSettings) private readonly invoiceSettingsRepo: Repository<InvoiceSettings>,
    @InjectRepository(Quote) private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(Payment) private readonly paymentsRepo: Repository<Payment>,
  ) {}

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

    // Outstanding = invoiced in this window but no payment shares its
    // chain yet (regardless of when that payment itself was recorded —
    // an invoice from the end of the period may only get paid weeks
    // later, which is exactly what "outstanding" is supposed to catch).
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
    const outstanding = invoices.filter((i) => !i.chainId || !paidChainIdSet.has(i.chainId));

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
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
