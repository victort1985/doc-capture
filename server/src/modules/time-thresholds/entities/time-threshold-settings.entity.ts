import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

/**
 * Configurable thresholds behind the app-wide "how urgent is this"
 * color rule — the same warning/danger two-stage pattern, applied to
 * three different kinds of deadline, each on its own natural time
 * scale (hours for a call that should get picked up same-day, days
 * for a vehicle inspection or an equipment rental measured in weeks).
 * One row per organization, auto-created on first read/write — same
 * singleton-settings pattern as TemplateDesignSettings.
 *
 * Everywhere this drives a color (call list, vehicle list, rental
 * list, and the Home tab's attention notifications) colors the WHOLE
 * row/card, not a small dot — that's a product decision from how this
 * was specified, not an oversight; a full-field color is meant to be
 * impossible to miss at a glance across a long list.
 */
@Entity('time_threshold_settings')
export class TimeThresholdSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  organization: Organization;

  /** Calls: normal until this many hours old, then yellow. */
  @Column({ type: 'integer', default: 24 })
  callsWarningHours: number;

  /** Calls: red from this many hours old onward. */
  @Column({ type: 'integer', default: 72 })
  callsDangerHours: number;

  /** Vehicle inspection/test: yellow starting this many days before
   * the due date. */
  @Column({ type: 'integer', default: 30 })
  vehicleWarningDays: number;

  /** Vehicle inspection/test: red starting this many days before the
   * due date (and for anything already overdue). */
  @Column({ type: 'integer', default: 7 })
  vehicleDangerDays: number;

  /** Equipment rental: yellow starting this many days before the
   * agreed return date. */
  @Column({ type: 'integer', default: 3 })
  rentalWarningDays: number;

  /** Equipment rental: red starting this many days before the
   * return date (and for anything already overdue). */
  @Column({ type: 'integer', default: 1 })
  rentalDangerDays: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
