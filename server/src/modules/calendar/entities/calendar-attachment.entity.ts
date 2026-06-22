import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CalendarEvent } from './calendar-event.entity';
import { User } from '../../users/entities/user.entity';
import { StorageConnection } from '../../storage/entities/storage-connection.entity';

@Entity('calendar_attachments')
export class CalendarAttachment {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => CalendarEvent, (e) => e.attachments, { onDelete: 'CASCADE' })
  event: CalendarEvent;

  @Column()
  originalName: string;

  @Column({ nullable: true })
  relativePath?: string;

  @Column({ nullable: true })
  mimetype?: string;

  @Column({ default: false })
  encrypted: boolean;

  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  storageConnection?: StorageConnection;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  uploadedBy?: User;

  @CreateDateColumn()
  createdAt: Date;
}
