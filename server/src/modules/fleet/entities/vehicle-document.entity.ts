import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Vehicle } from './vehicle.entity';
import { User } from '../../users/entities/user.entity';

@Entity('vehicle_documents')
export class VehicleDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Vehicle, { onDelete: 'CASCADE' })
  vehicle: Vehicle;

  @Column()
  originalName: string;

  @Column()
  relativePath: string; // vehicles/{vehicleId}/{filename}

  @Column({ nullable: true })
  mimetype?: string;

  @Column({ default: false })
  encrypted: boolean;

  @Column({ nullable: true })
  description?: string; // "Insurance", "Registration", etc.

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  uploadedBy?: User;

  @CreateDateColumn()
  createdAt: Date;
}
