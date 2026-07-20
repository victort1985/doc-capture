import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { User } from '../../users/entities/user.entity';
import { numericTransformer } from '../../../common/transformers/numeric.transformer';

@Entity('fuel_refuels')
export class FuelRefuel {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  vehicle: Vehicle;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, transformer: numericTransformer })
  liters: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  cost?: number;

  @Column({ nullable: true })
  odometer?: number; // km

  @Column({ nullable: true })
  station?: string;

  @Column({ nullable: true })
  notes?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  registeredBy?: User;

  @CreateDateColumn()
  createdAt: Date;
}
