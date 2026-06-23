import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';
import { User } from '../../users/entities/user.entity';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  make: string;

  @Column()
  model: string;

  @Column({ nullable: true })
  year?: number;

  @Column({ unique: false })
  licensePlate: string;

  @Column({ nullable: true })
  color?: string;

  @Column({ nullable: true })
  vin?: string;

  @Column({ default: 0 })
  currentMileage: number;

  @Column({ nullable: true })
  notes?: string;

  @Column({ type: 'date', nullable: true })
  lastInspectionDate?: string;

  @Column({ type: 'date', nullable: true })
  lastTestDate?: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  /** User currently assigned/using this vehicle */
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  assignedUser?: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
