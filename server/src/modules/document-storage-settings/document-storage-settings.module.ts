import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentTypeSettings } from './entities/document-type-settings.entity';
import { DocumentStorageSettingsService } from './document-storage-settings.service';
import { DocumentStorageSettingsController } from './document-storage-settings.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentTypeSettings])],
  controllers: [DocumentStorageSettingsController],
  providers: [DocumentStorageSettingsService],
  exports: [DocumentStorageSettingsService],
})
export class DocumentStorageSettingsModule {}
