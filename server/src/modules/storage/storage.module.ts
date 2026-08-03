import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StorageConnection } from './entities/storage-connection.entity';
import { ClientStorageSettings } from './entities/client-storage-settings.entity';
import { User } from '../users/entities/user.entity';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StorageConnection, ClientStorageSettings, User])],
  controllers: [StorageController],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
