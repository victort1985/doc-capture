import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ServiceCall } from './service-call.entity';
import { User } from '../../users/entities/user.entity';

/**
 * One row per user per "started working" press on a call (spec item 8).
 *
 * Multiple users can each press "In progress" independently — each gets
 * their own session row with its own timer, rather than one shared
 * status-changed timestamp on the call itself (which only ever tracked a
 * single user). `endedAt` is set when the call closes (every still-open
 * session is stopped at that moment, not just the closer's own) — after
 * that, rows are kept permanently so the elapsed time + name stay visible
 * on the call even once closed, per spec ("их данные продолжают
 * показываться рядом с этим вызовом").
 */
@Entity('call_working_sessions')
export class CallWorkingSession {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ServiceCall, { onDelete: 'CASCADE' })
  call: ServiceCall;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  user?: User;

  // Denormalized so the name still displays even if the user is later
  // deleted (onDelete: SET NULL above would otherwise blank it out).
  @Column()
  userName: string;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  endedAt?: Date;
}
