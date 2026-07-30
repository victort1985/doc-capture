import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TemplateDesignSettings } from './entities/template-design-settings.entity';
import { TemplateDesignService } from './template-design.service';
import { TemplateDesignController } from './template-design.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TemplateDesignSettings])],
  controllers: [TemplateDesignController],
  providers: [TemplateDesignService],
  exports: [TemplateDesignService],
})
export class TemplateDesignModule {}
