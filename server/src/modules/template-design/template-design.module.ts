import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateDesignSettings } from './entities/template-design-settings.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { TemplateDesignService } from './template-design.service';
import { TemplatePreviewService } from './template-preview.service';
import { TemplateDesignController } from './template-design.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TemplateDesignSettings, Organization])],
  controllers: [TemplateDesignController],
  providers: [TemplateDesignService, TemplatePreviewService],
  exports: [TemplateDesignService],
})
export class TemplateDesignModule {}
