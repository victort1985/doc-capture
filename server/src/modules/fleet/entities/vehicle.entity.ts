import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../../organizations/entities/organization.entity';

@Entity('vehicles')
export class Vehicle {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  make: string; // Toyota, Ford…

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
  currentMileage: number; // текущий километраж

  @Column({ nullable: true })
  notes?: string;

  // Annual inspection (ביקורת שנתית)
  @Column({ type: 'date', nullable: true })
  lastInspectionDate?: string;

  // Annual test (טסט שנתי)
  @Column({ type: 'date', nullable: true })
  lastTestDate?: string;

  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'CASCADE' })
  organization?: Organization;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
