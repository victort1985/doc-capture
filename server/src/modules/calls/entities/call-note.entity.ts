import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { ServiceCall } from './service-call.entity';
import { StorageConnection } from '../../storage/entities/storage-connection.entity';

@Entity('call_notes')
export class CallNote {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ServiceCall, { onDelete: 'CASCADE' })
  call: ServiceCall;

  @ManyToOne(() => User)
  author: User;

  @Column({ type: 'text', nullable: true })
  text?: string;

  @Column({ nullable: true })
  photoGeneratedName?: string;

  @Column({ nullable: true })
  photoRelativePath?: string;

  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  photoStorageConnection?: StorageConnection;

  @Column({ default: false })
  photoEncrypted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
