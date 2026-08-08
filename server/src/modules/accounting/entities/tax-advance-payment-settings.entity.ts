import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

export enum AdvancePaymentFrequency {
  MONTHLY = 'monthly',
  BIMONTHLY = 'bimonthly',
}

/**
 * Income-tax advance payments (מקדמות מס הכנסה) — Israeli
 * self-employed/companies pay a percentage of revenue as an advance
 * against the year's eventual income tax bill, on the same
 * monthly/bimonthly cadence as VAT reporting. `rate` is set once by
 * the business owner or their accountant (it's assigned by the Tax
 * Authority based on the business's own history/sector, not
 * something this app calculates), and every period's amount due is
 * just revenue-for-that-period × rate — see
 * TaxAdvancePaymentService.getPeriods, which computes this fresh from
 * the real ledger each time rather than storing a number that could
 * drift out of sync with the books.
 */
@Entity('tax_advance_payment_settings')
export class TaxAdvancePaymentSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  /** Percentage, e.g. 8.25 for 8.25% — assigned by the Tax Authority,
   * shown on the business's own מקדמות notice. Zero/unset means
   * advance payments haven't been configured yet. */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  rate: number;

  @Column({ type: 'enum', enum: AdvancePaymentFrequency, default: AdvancePaymentFrequency.BIMONTHLY })
  frequency: AdvancePaymentFrequency;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
