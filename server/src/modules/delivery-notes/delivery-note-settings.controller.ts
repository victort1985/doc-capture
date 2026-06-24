import {
  Body, Controller, Get, Param, ParseIntPipe,
  Post, Put, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeliveryNoteSettings } from './delivery-note-settings.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('delivery-note-settings')
@UseGuards(JwtAuthGuard)
export class DeliveryNoteSettingsController {
  constructor(
    @InjectRepository(DeliveryNoteSettings)
    private readonly repo: Repository<DeliveryNoteSettings>,
  ) {}

  /** Get settings for the caller's organization (or by orgId for super-admin) */
  @Get(':orgId')
  async getByOrg(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.repo.findOne({ where: { organization: { id: orgId } } }) ?? {};
  }

  @Get()
  async getMine(@CurrentUser() user: ReqUser) {
    if (user.organizationId == null) return {};
    return this.repo.findOne({ where: { organization: { id: user.organizationId } } }) ?? {};
  }

  /** Create or update settings for an org */
  @Put(':orgId')
  async upsert(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: Partial<DeliveryNoteSettings>,
  ) {
    let settings = await this.repo.findOne({ where: { organization: { id: orgId } } });
    if (!settings) {
      settings = this.repo.create({ organization: { id: orgId } as any });
    }
    Object.assign(settings, dto);
    return this.repo.save(settings);
  }

  /** Upload logo for an org's delivery note template */
  @Post(':orgId/logo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 } }))
  async uploadLogo(
    @Param('orgId', ParseIntPipe) orgId: number,
    @UploadedFile() file: { buffer: Buffer; mimetype: string },
  ) {
    let settings = await this.repo.findOne({ where: { organization: { id: orgId } } });
    if (!settings) settings = this.repo.create({ organization: { id: orgId } as any });
    settings.logoBase64 = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    settings.logoMimetype = file.mimetype;
    return this.repo.save(settings);
  }

  /** Get all orgs' settings — for super-admin overview */
  @Get('all')
  async getAll(@CurrentUser() user: ReqUser) {
    if (user.organizationId != null) {
      return [await this.repo.findOne({ where: { organization: { id: user.organizationId } } })].filter(Boolean);
    }
    return this.repo.find({ relations: ['organization'] });
  }
}
