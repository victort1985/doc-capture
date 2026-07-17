import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

/**
 * One mobile app *installation* = one device, regardless of which
 * user account logs in on it (per the licensing model: the limit is
 * on physical devices, not user seats). deviceId is a UUID the app
 * generates once on first launch and persists locally — see
 * mobile-client/lib/services/device_id.dart.
 */
@Entity('registered_devices')
export class RegisteredDevice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  deviceId: string;

  @Column({ nullable: true })
  platform?: string;

  @Column({ default: false })
  revoked: boolean;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  lastUser?: User;

  @CreateDateColumn()
  firstSeenAt: Date;

  @UpdateDateColumn()
  lastSeenAt: Date;
}
