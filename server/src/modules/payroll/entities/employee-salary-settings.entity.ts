import { Column, CreateDateColumn, Entity, ManyToOne, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

export enum SalaryType {
  HOURLY = 'hourly',
  GLOBAL = 'global',
}

/**
 * How one employee gets paid, plus their own overtime/Shabbat/holiday
 * premium rates. The default percentages below (125/150/175/200) are
 * the LEGAL MINIMUMS under חוק שעות עבודה ומנוחה תשי"א-1951 and the
 * Labor Court's own consistent case law on combining the weekly-rest
 * premium with overtime — see PayrollCalculationService's own doc
 * comment for the full citations and formulas. These fields exist to
 * let a collective agreement or personal contract set something
 * MORE generous than the legal floor (common in some sectors), never
 * less — see PayrollCalculationController's own validation, which
 * rejects a rate below the legal minimum outright rather than saving
 * a wage-law violation into the system.
 *
 * For a GLOBAL salary specifically: Israeli case law recognizes a
 * global overtime/Shabbat arrangement as lawful only when it
 * genuinely reflects the employee's own actual average overtime, is
 * separately itemized on the payslip (not folded silently into base
 * pay), and — critically — the employee ends up no worse off than
 * the itemized legal calculation would have given them. This entity
 * does not and cannot certify that an agreement satisfies all of
 * that on its own (informed consent, genuineness of the average, is
 * a factual/legal question about how the arrangement was actually
 * reached, not something derivable from stored numbers) — see the
 * payslip report's own "global salary floor check" for what this app
 * DOES verify automatically (whether the stated global amount is at
 * least what the itemized calculation would produce for the same
 * hours), which is a real, useful compliance aid but not a
 * substitute for the informed-consent and genuineness requirements a
 * labor lawyer or accountant should confirm directly with the
 * employee and employer.
 */
@Entity('employee_salary_settings')
export class EmployeeSalarySettings {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @Column({ type: 'enum', enum: SalaryType, default: SalaryType.HOURLY })
  salaryType: SalaryType;

  /** How many hours make up this employee's own standard workday
   * before overtime starts — see PayrollCalculationService's own doc
   * comment for the legal basis: חוק שעות עבודה ומנוחה defines
   * overtime relative to the employee's own standard daily quota, not
   * a fixed universal number. Allowed range is 4-8 hours (covers
   * everything from a short part-time day up to the standard full
   * day) — a bounded RANGE rather than an arbitrary free-text number,
   * so an admin still can't accidentally set something legally
   * meaningless (e.g. 0 or 24), but isn't limited to only the two
   * most common values either. The SAME threshold applies whether the
   * day in question is an ordinary day or a rest day/holiday — what
   * changes between those is the PERCENTAGE paid, not where the
   * regular-vs-overtime line falls; both use this same value. */
  @Column({ type: 'int', default: 8 })
  standardWorkdayHours: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  hourlyRate?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  globalMonthlySalary?: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 125, transformer: numericTransformer })
  overtimeFirst2HoursPercent: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 150, transformer: numericTransformer })
  overtimeBeyond2HoursPercent: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 150, transformer: numericTransformer })
  restDayPercent: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 175, transformer: numericTransformer })
  restDayOvertimeFirst2HoursPercent: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 200, transformer: numericTransformer })
  restDayOvertimeBeyond2HoursPercent: number;

  /** City name (for display) + coordinates, used to compute the
   * EXACT candle-lighting/havdalah times for this specific employee's
   * work location via @hebcal/core, rather than relying on the
   * organization-wide fixed-hour Shabbat window
   * (OrganizationPayrollSettings.shabbatStartHour/EndHour). Per the
   * legal basis confirmed before building this (a Labor Court ruling
   * interpreting "Shabbat" in חוק שעות עבודה ומנוחה according to its
   * meaning in Jewish tradition — actual sunset to nightfall, not a
   * fixed clock time or a single national reference point like
   * Jerusalem) — the legally correct DEFAULT, absent an employer's own
   * written definition, genuinely does depend on the actual location
   * where the employee works. Null (the default for every existing
   * employee) means "no city set" — PayrollCalculationService falls
   * back to the organization's own fixed-hour window in that case,
   * preserving the existing behavior and any employer's own written,
   * contractually-defined rest-period hours, which the law explicitly
   * allows to override the astronomical default. */
  @Column({ type: 'varchar', nullable: true })
  cityName?: string | null;

  @Column({ type: 'double precision', nullable: true })
  cityLat?: number | null;

  @Column({ type: 'double precision', nullable: true })
  cityLon?: number | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
