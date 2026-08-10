import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * Per-organization override of when the weekly rest period (Shabbat)
 * actually starts and ends — see PayrollCalculationService's own doc
 * comment for why this can't be computed astronomically here and
 * defaults to a deliberately wide, employee-favoring window
 * (Friday 18:00 – Saturday 20:00) until an organization sets its own.
 * An employer who wants payroll to match their own real candle-
 * lighting/havdalah practice (which varies by season and city) should
 * update this periodically rather than leave the wide default in
 * place indefinitely — the default protects against underpaying, not
 * against imprecision.
 */
@Entity('organization_payroll_settings')
export class OrganizationPayrollSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @Column({ type: 'int', default: 18 })
  shabbatStartHour: number;

  @Column({ type: 'int', default: 20 })
  shabbatEndHour: number;
}
