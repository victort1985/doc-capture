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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
