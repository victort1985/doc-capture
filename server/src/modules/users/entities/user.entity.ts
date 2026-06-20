import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Region } from '../../locations/entities/region.entity';
import { City } from '../../locations/entities/city.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  username: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  // Default language is Hebrew per spec; client falls back to this on login.
  @Column({ default: 'he' })
  language: string;

  // --- Call routing fields (added for regional call assignment) ---

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ nullable: true })
  specialization?: string;

  @Column({ nullable: true })
  phone?: string;

  // Technician's base city (informational/display) — distinct from
  // `regions` below, which drives call notification routing.
  @ManyToOne(() => City, { nullable: true, onDelete: 'SET NULL' })
  city?: City;

  // The regions a technician is responsible for — new calls in any of
  // these regions notify this user. Independent of `isGlobal` below;
  // a global user doesn't need any regions assigned at all.
  @ManyToMany(() => Region)
  @JoinTable({ name: 'user_regions' })
  regions: Region[];

  // "Глобальный" status: receives notifications for every new call
  // regardless of region, in addition to (not instead of) any
  // region-specific technicians.
  @Column({ default: false })
  isGlobal: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
