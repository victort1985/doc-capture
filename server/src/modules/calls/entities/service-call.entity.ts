import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

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

  // Place / organization name (spec field 1).
  @Column()
  place: string;

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
