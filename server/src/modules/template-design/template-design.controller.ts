import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { TemplateDesignService } from './template-design.service';
import { TemplatePreviewService } from './template-preview.service';
import { UpdateTemplateDesignDto } from './dto/update-template-design.dto';
import { PreviewTemplateDesignDto } from './dto/preview-template-design.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { organizationId: number | null };

@Controller('template-design')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TemplateDesignController {
  constructor(
    private readonly service: TemplateDesignService,
    private readonly previewService: TemplatePreviewService,
  ) {}

  @Get()
  async get(@CurrentUser() user: ReqUser) {
    if (user.organizationId == null) return null;
    return this.service.findOrCreate(user.organizationId);
  }

  @Post()
  async update(@Body() dto: UpdateTemplateDesignDto, @CurrentUser() user: ReqUser) {
    if (user.organizationId == null) return null;
    return this.service.update(user.organizationId, dto);
  }

  /** Renders a real sample document (through the exact same code path
   * every actual quote/invoice uses) as a PNG, reflecting whatever
   * design values are CURRENTLY on screen in the editor — including
   * ones not saved yet, so the preview always matches what dragging
   * the logo/company-info handles is currently showing, not just the
   * last-saved state. */
  @Post('preview')
  async preview(@Body() dto: PreviewTemplateDesignDto, @CurrentUser() user: ReqUser, @Res() res: Response) {
    const png = await this.previewService.renderPreviewPng(user.organizationId, dto);
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    res.send(png);
  }
}
