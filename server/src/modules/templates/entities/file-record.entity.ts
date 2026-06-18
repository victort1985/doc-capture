import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { StorageConnection } from '../../storage/entities/storage-connection.entity';

export enum FileRecordType {
  DOCUMENT = 'document',
  PHOTO = 'photo',
}

@Entity('file_records')
export class FileRecord {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  originalName: string;

  @Column()
  generatedName: string;

  @Column({ type: 'enum', enum: FileRecordType })
  type: FileRecordType;

  @Column()
  place: string;

  @ManyToOne(() => StorageConnection, { nullable: true, onDelete: 'SET NULL' })
  storageConnection?: StorageConnection;

  @Column()
  path: string;

  // The exact relative path passed to adapter.write() — needed to read
  // or remove the file later (download/delete endpoints), since `path`
  // above stores the full resolved path for display purposes and isn't
  // necessarily what adapter.read()/remove() expect as input.
  @Column({ nullable: true })
  relativePath?: string;

  @Column({ default: false })
  encrypted: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
