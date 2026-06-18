import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { User } from '../modules/users/entities/user.entity';
import { StorageConnection } from '../modules/storage/entities/storage-connection.entity';
import { ClientStorageSettings } from '../modules/storage/entities/client-storage-settings.entity';
import { FileTemplate } from '../modules/templates/entities/file-template.entity';
import { FileRecord } from '../modules/templates/entities/file-record.entity';

export function typeOrmConfig(): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'doc_capture',
    entities: [
      User,
      StorageConnection,
      ClientStorageSettings,
      FileTemplate,
      FileRecord,
    ],
    synchronize: process.env.NODE_ENV !== 'production', // TODO: switch to migrations before prod
    autoLoadEntities: true,
    // Off by default — a typical deploy has Postgres on the same machine/
    // LAN with no cert set up. Set DB_SSL=true once DB_HOST points at a
    // remote/cloud database. DB_SSL_REJECT_UNAUTHORIZED=false is only for
    // providers using self-signed certs (e.g. some managed Postgres free
    // tiers) — leave it true (default) wherever a real CA-signed cert is used.
    ssl:
      process.env.DB_SSL === 'true'
        ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
        : undefined,
  };
}
