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
