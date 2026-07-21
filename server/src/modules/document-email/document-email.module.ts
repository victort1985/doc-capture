import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentEmailSettings } from './entities/document-email-settings.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { DocumentEmailSettingsService } from './document-email-settings.service';
import { DocumentEmailSettingsController } from './document-email-settings.controller';
import { DocumentSendingService } from './document-sending.service';

@Module({
  imports: [TypeOrmModule.forFeature([DocumentEmailSettings, Organization])],
  controllers: [DocumentEmailSettingsController],
  providers: [DocumentEmailSettingsService, DocumentSendingService],
  exports: [DocumentSendingService],
})
export class DocumentEmailModule {}
