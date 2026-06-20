import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { encryptString, decryptString } from '../../../common/crypto/encryption.util';

export enum StorageType {
  LOCAL = 'local',
  FTP = 'ftp',
  SFTP = 'sftp',
  SYNOLOGY = 'synology',
}

@Entity('storage_connections')
export class StorageConnection {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: StorageType })
  type: StorageType;

  @Column({ nullable: true })
  host?: string;

  @Column({ nullable: true })
  port?: number;

  @Column({ nullable: true })
  username?: string;

  // Encrypted at rest (AES-256-GCM, see common/crypto/encryption.util.ts)
  // and excluded from default SELECTs — explicit opt-in only, mirroring
  // how User.passwordHash is handled. Never sent back via the API: see
  // StorageService.toPublic() in storage.service.ts.
  @Column({
    nullable: true,
    select: false,
    transformer: {
      to: (value?: string) => (value ? encryptString(value) : value),
      from: (value?: string) => (value ? decryptString(value) ?? value : value),
    },
  })
  password?: string;

  @Column()
  basePath: string;

  @Column({ type: 'jsonb', nullable: true })
  extraConfig?: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
