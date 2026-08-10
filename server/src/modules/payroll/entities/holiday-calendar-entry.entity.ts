import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * One recognized holiday date (יום חג) that carries the same wage
 * premium as the weekly day of rest under the General Extension
 * Order 2000 (צו הרחבה כללי בעניין דמי חגים) — nine days per year:
 * two days of Rosh Hashana, Yom Kippur, two days of Sukkot (first day
 * + Shmini Atzeret), two days of Passover (first + seventh/last day),
 * Shavuot, and Independence Day. Deliberately a plain admin-editable
 * table, NOT computed from the Hebrew calendar algorithmically — the
 * Hebrew calendar shifts against the Gregorian one every year (leap
 * months, etc.), and getting a single date wrong here directly
 * mis-prices real employee wages. An accountant or the business owner
 * enters/confirms each year's actual dates (easily looked up from any
 * Hebrew calendar) rather than trusting an algorithm no one is
 * independently checking. Seeded with 2026 as a starting point — see
 * migrate-payroll.sql for the actual seeded rows and their sourcing.
 */
@Entity('holiday_calendar')
export class HolidayCalendarEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  @Index()
  date: string;

  @Column()
  name: string;

  @Index()
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;
}
