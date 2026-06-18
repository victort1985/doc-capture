import { DataSource } from 'typeorm';
import { User } from '../modules/users/entities/user.entity';
import { StorageConnection } from '../modules/storage/entities/storage-connection.entity';
import { ClientStorageSettings } from '../modules/storage/entities/client-storage-settings.entity';
import { FileTemplate } from '../modules/templates/entities/file-template.entity';
import { FileRecord } from '../modules/templates/entities/file-record.entity';

// Used by the TypeORM CLI for migrations (npm run migration:generate / migration:run)
export default new DataSource({
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
  migrations: ['src/migrations/*.ts'],
});
