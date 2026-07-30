import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExchangeRate } from './entities/exchange-rate.entity';

export const SUPPORTED_CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Fetches and caches daily representative exchange rates from the
 * Bank of Israel's public API, requirement #19 ("мультивалюта").
 *
 * IMPORTANT — built from published API documentation only (boi.org.il
 * /PublicApi/GetExchangeRate?key=<CODE>), never verified against a
 * live response from this sandbox (the fetch tool available here
 * couldn't retrieve a clean JSON sample). The response shape below
 * is a best-effort parse trying several plausible field names
 * (currentExchangeRate / rate / exchangeRate / value) rather than
 * assuming one is definitely correct — if the real response uses a
 * field name none of these match, fetchLiveRate() falls through to
 * returning null, and the caller (getRate) then relies entirely on
 * whatever was last stored (fetched successfully before, or entered
 * manually) rather than crashing anything document-creation depends
 * on. Treat the very first live fetch as something to actually watch
 * the logs for, the same way Invoice Israel needed watching.
 */
@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(@InjectRepository(ExchangeRate) private readonly repo: Repository<ExchangeRate>) {}

  async getRate(currency: string, date?: string): Promise<number | null> {
    if (currency === 'ILS') return 1;
    const targetDate = date ?? new Date().toISOString().slice(0, 10);

    const cached = await this.repo.findOne({ where: { currency, date: targetDate } });
    if (cached) return cached.rateToIls;

    // Fall back to the most recent rate on file (banks don't publish
    // on weekends/holidays, and a slightly-stale rate is far better
    // than blocking document creation entirely).
    const latest = await this.repo.findOne({ where: { currency }, order: { date: 'DESC' } });

    const live = await this.fetchLiveRate(currency);
    if (live != null) {
      await this.repo.save(this.repo.create({ currency, date: targetDate, rateToIls: live, source: 'boi' }));
      return live;
    }

    if (latest) {
      this.logger.warn(`Live rate fetch failed for ${currency} — using last known rate from ${latest.date} (${latest.rateToIls})`);
      return latest.rateToIls;
    }

    this.logger.error(`No exchange rate available for ${currency} on ${targetDate} — live fetch failed and nothing cached. An admin needs to enter one manually.`);
    return null;
  }

  async setManualRate(currency: string, date: string, rateToIls: number): Promise<ExchangeRate> {
    const existing = await this.repo.findOne({ where: { currency, date } });
    if (existing) {
      existing.rateToIls = rateToIls;
      existing.source = 'manual';
      return this.repo.save(existing);
    }
    return this.repo.save(this.repo.create({ currency, date, rateToIls, source: 'manual' }));
  }

  async listRecent(currency: string, days = 30): Promise<ExchangeRate[]> {
    return this.repo.find({ where: { currency }, order: { date: 'DESC' }, take: days });
  }

  private async fetchLiveRate(currency: string): Promise<number | null> {
    try {
      const res = await fetch(`https://boi.org.il/PublicApi/GetExchangeRate?key=${currency}`);
      if (!res.ok) return null;
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!json) return null;
      const candidates = ['currentExchangeRate', 'exchangeRate', 'rate', 'value', 'currentRate'];
      for (const key of candidates) {
        const val = json[key];
        if (typeof val === 'number' && val > 0) return val;
        if (typeof val === 'string' && !Number.isNaN(Number(val)) && Number(val) > 0) return Number(val);
      }
      this.logger.warn(`BOI response for ${currency} didn't match any expected field name: ${JSON.stringify(json)}`);
      return null;
    } catch (err) {
      this.logger.warn(`BOI fetch failed for ${currency}: ${(err as Error).message}`);
      return null;
    }
  }
}
