import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxAdvancePaymentSettings, AdvancePaymentFrequency } from './entities/tax-advance-payment-settings.entity';
import { TaxAdvancePaymentRecord } from './entities/tax-advance-payment-record.entity';
import { AccountingService } from './accounting.service';

export interface AdvancePaymentPeriod {
  periodFrom: string;
  periodTo: string;
  revenue: number;
  rate: number;
  amountDue: number;
  paid: boolean;
  paidAmount?: number;
  paidDate?: string;
  recordId?: number;
}

@Injectable()
export class TaxAdvancePaymentService {
  constructor(
    @InjectRepository(TaxAdvancePaymentSettings) private readonly settingsRepo: Repository<TaxAdvancePaymentSettings>,
    @InjectRepository(TaxAdvancePaymentRecord) private readonly recordsRepo: Repository<TaxAdvancePaymentRecord>,
    private readonly accountingService: AccountingService,
  ) {}

  async getSettings(organizationId: number | null): Promise<TaxAdvancePaymentSettings> {
    const existing = await this.settingsRepo.findOne({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    if (existing) return existing;
    // Never actually persisted until updateSettings is called —
    // returning a zero-rate default so the settings page has
    // something sensible to show/edit rather than a 404 on first
    // visit.
    return this.settingsRepo.create({ rate: 0, frequency: AdvancePaymentFrequency.BIMONTHLY });
  }

  async updateSettings(organizationId: number | null, rate: number, frequency: AdvancePaymentFrequency): Promise<TaxAdvancePaymentSettings> {
    let settings = await this.settingsRepo.findOne({ where: organizationId != null ? { organization: { id: organizationId } } : {} });
    if (!settings) {
      settings = this.settingsRepo.create({ organization: organizationId != null ? ({ id: organizationId } as any) : undefined });
    }
    settings.rate = rate;
    settings.frequency = frequency;
    return this.settingsRepo.save(settings);
  }

  /** Every period in `year`, each with its own revenue-derived amount
   * due and paid/unpaid status — see this file's own imports/entity
   * comments for why nothing about the calculated amount is ever
   * stored ahead of time. Bimonthly periods follow the Israeli VAT
   * convention (Jan-Feb, Mar-Apr, ...), matching the cadence most
   * businesses on this frequency already think in. */
  async getPeriods(organizationId: number | null, year: number): Promise<AdvancePaymentPeriod[]> {
    const settings = await this.getSettings(organizationId);
    const boundaries = this.periodBoundaries(year, settings.frequency);

    const records = await this.recordsRepo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
    });

    const periods: AdvancePaymentPeriod[] = [];
    for (const { from, to } of boundaries) {
      const pnl = await this.accountingService.profitAndLoss(organizationId, from, to);
      const revenue = pnl.totalRevenue;
      const amountDue = Math.round(revenue * (settings.rate / 100) * 100) / 100;
      const record = records.find((r) => r.periodFrom === from && r.periodTo === to);
      periods.push({
        periodFrom: from,
        periodTo: to,
        revenue,
        rate: settings.rate,
        amountDue,
        paid: !!record,
        paidAmount: record ? record.paidAmount : undefined,
        paidDate: record ? record.paidDate : undefined,
        recordId: record?.id,
      });
    }
    return periods;
  }

  private periodBoundaries(year: number, frequency: AdvancePaymentFrequency): { from: string; to: string }[] {
    const pad = (n: number) => String(n).padStart(2, '0');
    const lastDay = (y: number, m: number) => new Date(y, m, 0).getDate(); // m is 1-indexed month
    const boundaries: { from: string; to: string }[] = [];
    const step = frequency === AdvancePaymentFrequency.MONTHLY ? 1 : 2;
    for (let m = 1; m <= 12; m += step) {
      const endMonth = Math.min(m + step - 1, 12);
      boundaries.push({
        from: `${year}-${pad(m)}-01`,
        to: `${year}-${pad(endMonth)}-${pad(lastDay(year, endMonth))}`,
      });
    }
    return boundaries;
  }

  async markPaid(organizationId: number | null, periodFrom: string, periodTo: string, paidAmount: number, paidDate: string, reference?: string): Promise<TaxAdvancePaymentRecord> {
    const existing = await this.recordsRepo.findOne({
      where: {
        periodFrom, periodTo,
        ...(organizationId != null ? { organization: { id: organizationId } } : {}),
      },
    });
    if (existing) {
      existing.paidAmount = paidAmount;
      existing.paidDate = paidDate;
      existing.reference = reference;
      return this.recordsRepo.save(existing);
    }
    const record = this.recordsRepo.create({
      periodFrom, periodTo, paidAmount, paidDate, reference,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
    });
    return this.recordsRepo.save(record);
  }

  async unmarkPaid(organizationId: number | null, recordId: number): Promise<void> {
    const record = await this.recordsRepo.findOne({ where: { id: recordId }, relations: ['organization'] });
    if (!record) throw new NotFoundException('Payment record not found');
    if (organizationId != null && record.organization?.id !== organizationId) throw new NotFoundException('Payment record not found');
    await this.recordsRepo.remove(record);
  }
}
