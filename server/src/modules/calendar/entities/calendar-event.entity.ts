import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Calendar } from './calendar.entity';
import { User } from '../../users/entities/user.entity';
import { CalendarAttachment } from './calendar-attachment.entity';

export enum CalendarEventType {
  EVENT = 'event',
  TASK = 'task',
}

export enum CalendarEventRepeat {
  NONE = 'none',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

@Entity('calendar_events')
export class CalendarEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Calendar, { onDelete: 'CASCADE' })
  calendar: Calendar;

  @Column({ type: 'enum', enum: CalendarEventType, default: CalendarEventType.EVENT })
  type: CalendarEventType;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'timestamptz' })
  startAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endAt?: Date;

  @Column({ default: false })
  allDay: boolean;

  // Task-specific: marks the task as done
  @Column({ default: false })
  done: boolean;

  @Column({ nullable: true })
  location?: string;

  // Optional override of the calendar's color for this specific event
  @Column({ nullable: true })
  color?: string;

  @Column({ type: 'enum', enum: CalendarEventRepeat, default: CalendarEventRepeat.NONE })
  repeat: CalendarEventRepeat;

  // For future Google Calendar sync
  @Column({ nullable: true })
  googleEventId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  createdBy?: User;

  @OneToMany(() => CalendarAttachment, (a) => a.event)
  attachments: CalendarAttachment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
