import { Column, CreateDateColumn, Entity, ManyToOne, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';

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

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  hourlyRate?: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  globalMonthlySalary?: number | null;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 125 })
  overtimeFirst2HoursPercent: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 150 })
  overtimeBeyond2HoursPercent: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 150 })
  restDayPercent: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 175 })
  restDayOvertimeFirst2HoursPercent: number;

  @Column({ type: 'numeric', precision: 6, scale: 2, default: 200 })
  restDayOvertimeBeyond2HoursPercent: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
