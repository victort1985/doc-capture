import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

/**
 * Daily exchange rate cache, requirement #19 ("мультивалюта"). Rate
 * is always expressed as "1 unit of `currency` = `rateToIls` ILS" —
 * matching how the Bank of Israel's own representative-rate API
 * (boi.org.il/PublicApi/GetExchangeRate) publishes it, so no
 * direction-flipping is needed when reading a fetched value straight
 * into this table.
 */
@Entity('exchange_rates')
@Index(['currency', 'date'], { unique: true })
export class ExchangeRate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  currency: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'numeric', precision: 12, scale: 6, transformer: numericTransformer })
  rateToIls: number;

  /** 'boi' (fetched from the Bank of Israel) or 'manual' (an admin
   * typed it in — the fallback this whole feature leans on whenever
   * the BOI fetch fails or its exact response shape turns out to
   * differ from what was assumed here, since this integration —
   * like Invoice Israel earlier — was built from published API
   * documentation, not verified against a live call from this
   * sandbox). */
  @Column({ type: 'varchar', default: 'boi' })
  source: 'boi' | 'manual';

  @CreateDateColumn()
  createdAt: Date;
}
