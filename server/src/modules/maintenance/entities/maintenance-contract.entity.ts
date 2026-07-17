import {
  Column, CreateDateColumn, Entity, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Location } from '../../locations/entities/location.entity';
import { User } from '../../users/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { CallUrgency } from '../../calls/entities/service-call.entity';

export enum MaintenanceFrequency {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

/**
 * A recurring service commitment for one location — "come check the
 * gym equipment every month" — that auto-creates a real ServiceCall
 * (via CallsService.create, same as a human-created call: same
 * notifications, same folder naming) each time it comes due, rather
 * than someone having to remember. MaintenanceCron checks daily for
 * contracts where nextRunDate <= today.
 */
@Entity('maintenance_contracts')
export class MaintenanceContract {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @ManyToOne(() => Location, { onDelete: 'CASCADE' })
  location: Location;

  @Column({ type: 'enum', enum: MaintenanceFrequency })
  frequency: MaintenanceFrequency;

  @Column({ type: 'date' })
  nextRunDate: string;

  @Column({ default: true })
  active: boolean;

  // Template fields for the auto-created call — see ServiceCall's
  // required (non-nullable) columns; a scheduled call has no human
  // reporting a problem, so these are pre-filled once here.
  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: CallUrgency, default: CallUrgency.NOT_URGENT })
  urgency: CallUrgency;

  @Column({ default: 'Scheduled maintenance' })
  contactName: string;

  @Column({ nullable: true })
  contactPhone?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt?: Date;

  // Attributed to whoever set up the contract — used as the
  // auto-created call's createdBy (that column isn't nullable).
  @ManyToOne(() => User)
  createdBy: User;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  static advance(date: string, frequency: MaintenanceFrequency): string {
    const d = new Date(date + 'T00:00:00Z');
    switch (frequency) {
      case MaintenanceFrequency.WEEKLY: d.setUTCDate(d.getUTCDate() + 7); break;
      case MaintenanceFrequency.MONTHLY: d.setUTCMonth(d.getUTCMonth() + 1); break;
      case MaintenanceFrequency.QUARTERLY: d.setUTCMonth(d.getUTCMonth() + 3); break;
      case MaintenanceFrequency.YEARLY: d.setUTCFullYear(d.getUTCFullYear() + 1); break;
    }
    return d.toISOString().slice(0, 10);
  }
}
