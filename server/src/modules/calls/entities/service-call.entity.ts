import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Location } from '../../locations/entities/location.entity';
import { CallWorkingSession } from './call-working-session.entity';
import { Organization } from '../../organizations/entities/organization.entity';

export enum CallUrgency {
  URGENT = 'urgent',
  NOT_URGENT = 'not_urgent',
}

export enum CallStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  CLOSED = 'closed',
}

@Entity('service_calls')
export class ServiceCall {
  @PrimaryGeneratedColumn()
  id: number;

  // Place / organization name (spec field 1). Kept as a plain string for
  // backward compatibility with existing calls and any code that reads
  // it directly (folder naming, exports, etc.) — when `location` below
  // is set, this is kept in sync with `location.name` server-side.
  @Column()
  place: string;

  // Optional FK into the shared locations directory (added later —
  // nullable so existing calls created before this feature still work).
  // The same Location entity also doubles as "Организация" on phone
  // book contacts, so this is what links a call to "people who work
  // here" for contact lookup.
  @ManyToOne(() => Location, { nullable: true, onDelete: 'SET NULL' })
  location?: Location;

  // Optional geodata (spec field 2) — nullable, the mobile client only
  // sends these if the person actually taps "get location".
  @Column({ type: 'double precision', nullable: true })
  latitude?: number;

  @Column({ type: 'double precision', nullable: true })
  longitude?: number;

  @Column({ type: 'enum', enum: CallUrgency, default: CallUrgency.NOT_URGENT })
  urgency: CallUrgency;

  // Who is reporting the problem on the client's side, not who in our
  // system created the record (that's `createdBy` below) — spec field 4.
  @Column()
  contactName: string;

  @Column()
  contactPosition: string;

  @Column()
  contactPhone: string;

  @Column({ type: 'text' })
  description: string;

  // "Unusual damage" checkbox (spec item 6).
  @Column({ default: false })
  unusualDamage: boolean;

  @Column({ type: 'enum', enum: CallStatus, default: CallStatus.OPEN })
  status: CallStatus;

  // Auto-set server-side from the authenticated user (spec field 6) — never
  // trusted from client input.
  @ManyToOne(() => User)
  createdBy: User;

  // Multi-tenant boundary — see User.organization. Auto-set from the
  // creating user's organization at creation time.
  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true })
  statusChangedBy?: User;

  @Column({ type: 'timestamp', nullable: true })
  statusChangedAt?: Date;

  // Denormalized on top of statusChangedBy: kept even if the call is later
  // reopened and closed again by someone else, since the storage folder
  // name (see calls.service.ts) is finalized once and not renamed twice.
  @ManyToOne(() => User, { nullable: true })
  closedBy?: User;

  // The folder name fragment computed at creation time (id+date+place) and
  // finalized (closer's username appended) when the call is closed — see
  // CallsService. Stored explicitly so the rename-on-close step knows
  // exactly what the folder is currently called.
  @Column({ nullable: true })
  storageFolderName?: string;

  @Column({ default: false })
  storageFolderFinalized: boolean;

  // The red "time since opened" timer is just createdAt below, computed
  // client-side. Per-user "in progress" timers (spec item 8) are tracked
  // separately, one row per press — see CallWorkingSession.
  @OneToMany(() => CallWorkingSession, (session) => session.call)
  workingSessions: CallWorkingSession[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
