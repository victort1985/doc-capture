import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

/**
 * One shared calendar per organization. Created automatically when an
 * organization is created; not exposed as a user-facing CRUD endpoint —
 * users just see "the org calendar" without needing to manage calendar
 * objects themselves. Personal calendars deliberately excluded per spec.
 */
@Entity('calendars')
export class Calendar {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ default: '#4A90E2' })
  color: string;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User;

  // Placeholder for future Google Calendar sync
  @Column({ nullable: true })
  googleCalendarId?: string;

  /** Refresh token for the connected Google account (one-way sync:
   * Google → Vixor). Never exposed to the client. */
  @Column({ type: 'text', nullable: true, select: false })
  googleRefreshToken?: string;

  /** Which Google account is connected, shown in the admin panel so it's
   * clear whose calendar is being pulled from. */
  @Column({ nullable: true })
  googleConnectedEmail?: string;

  /** Google Calendar API sync cursor for incremental polling — lets us
   * fetch only what changed since the last sync instead of the whole
   * calendar every time. */
  @Column({ type: 'text', nullable: true })
  googleSyncToken?: string;

  @Column({ type: 'timestamptz', nullable: true })
  googleLastSyncedAt?: Date;

  /** Secret token for the public ICS feed URL.
   *  Generated once, used to authenticate calendar subscriptions
   *  from Google Calendar / Apple Calendar / Outlook without login. */
  @Column({ nullable: true, unique: true })
  icsToken?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
