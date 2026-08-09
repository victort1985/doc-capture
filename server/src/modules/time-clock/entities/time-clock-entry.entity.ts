import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Organization } from '../../organizations/entities/organization.entity';
import { CostCenter } from '../../cost-centers/entities/cost-center.entity';

/**
 * One clock-in/clock-out shift for an employee (שעון נוכחות). A
 * genuinely open shift has clockOut = null — see
 * TimeClockService.clockIn's own guard against a second concurrent
 * open shift for the same person, and .clockOut for how an open
 * shift gets closed. Optional costCenter lets labor time attribute
 * to the same project/department concept already used for expense
 * and revenue tracking (see cost-centers module) — a person working
 * mostly on one job can log their hours against it.
 */
@Entity('time_clock_entries')
export class TimeClockEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @Index()
  user: User;

  @Column({ type: 'timestamp' })
  clockIn: Date;

  @Column({ type: 'timestamp', nullable: true })
  clockOut?: Date | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @ManyToOne(() => CostCenter, { nullable: true, onDelete: 'SET NULL' })
  costCenter?: CostCenter | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  @Index()
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;
}
