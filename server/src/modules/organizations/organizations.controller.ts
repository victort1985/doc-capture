import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { OrganizationsService } from './organizations.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const MAX_LOGO_SIZE = 5 * 1024 * 1024;

@Controller('organizations')
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  // Managing organizations themselves (not their data) is super-admin
  // only — an org-scoped admin manages their own org's users/calls/
  // locations/contacts, not the org list.
  @Get()
  @UseGuards(SuperAdminGuard)
  findAll() {
    return this.orgsService.findAll();
  }

  @Post()
  @UseGuards(SuperAdminGuard)
  create(@Body() dto: CreateOrganizationDto) {
    return this.orgsService.create(dto);
  }

  @Patch(':id')
  @UseGuards(SuperAdminGuard)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrganizationDto) {
    return this.orgsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(SuperAdminGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.orgsService.remove(id);
  }

  @Post(':id/logo')
  @UseGuards(SuperAdminGuard)
  @UseInterceptors(FileInterceptor('logo', { limits: { fileSize: MAX_LOGO_SIZE } }))
  async setLogo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string },
  ) {
    if (!file) return { ok: false, message: 'No file provided' };
    await this.orgsService.setLogo(id, file.buffer, file.mimetype);
    return { ok: true };
  }

  @Get(':id/logo')
  async getLogo(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const logo = await this.orgsService.getLogo(id);
    if (!logo) {
      res.status(404).send();
      return;
    }
    res.set({ 'Content-Type': logo.mimetype });
    res.send(logo.data);
  }

  // Self-service: any authenticated user (mobile app) can fetch their
  // OWN organization's logo — used for the 80%-opacity background image
  // (spec item: "Естественно что логотип будет отображаться именно тот
  // к какой компании принадлежит пользователь"). No org id in the URL —
  // derived from the requester's own JWT-resolved organizationId, never
  // trusted as a parameter, so one org's users can't fetch another's
  // logo by guessing an id.
  @Get('my-logo')
  async getMyLogo(@CurrentUser() user: { organizationId: number | null }, @Res() res: Response) {
    if (user.organizationId == null) {
      res.status(404).send();
      return;
    }
    const logo = await this.orgsService.getLogo(user.organizationId);
    if (!logo) {
      res.status(404).send();
      return;
    }
    res.set({ 'Content-Type': logo.mimetype });
    res.send(logo.data);
  }
}
