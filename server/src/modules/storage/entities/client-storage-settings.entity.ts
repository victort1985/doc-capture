import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { StorageConnection } from './storage-connection.entity';

@Entity('client_storage_settings')
export class ClientStorageSettings {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  documentStorageConnection?: StorageConnection;

  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  photoStorageConnection?: StorageConnection;

  @Column({ default: '{date}/{place}' })
  documentSubfolderPattern: string;

  @Column({ default: '{date}/{place}' })
  photoSubfolderPattern: string;
}
