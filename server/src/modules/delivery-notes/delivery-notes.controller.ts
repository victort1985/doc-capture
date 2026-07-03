import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe,
  Patch, Post, Query, Req, Res, SetMetadata, UseGuards,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { DeliveryNotesService } from './delivery-notes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { getActiveOrgId } from '../../common/utils/active-org.util';

const SkipAuth = () => SetMetadata('skipAuth', true);
type ReqUser = { id: number; organizationId: number | null; allowedOrganizationIds?: number[]; firstName?: string; lastName?: string; username?: string };

@Controller('delivery-notes')
export class DeliveryNotesController {
  constructor(private readonly svc: DeliveryNotesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(
    @CurrentUser() user: ReqUser,
    @Req() req: Request,
    @Query('orgId') orgIdParam?: string,
  ) {
    // Super-admin can filter by specific org via ?orgId=X
    if (user.organizationId == null && orgIdParam) {
      const parsed = parseInt(orgIdParam, 10);
      if (!isNaN(parsed)) return this.svc.findAll(parsed);
    }
    return this.svc.findAll(getActiveOrgId(user, req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('autocomplete/clients')
  autocompleteClients(@Query('q') q = '', @CurrentUser() user: ReqUser, @Req() req: Request) {
    return this.svc.autocompleteClients(q, getActiveOrgId(user, req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('autocomplete/field')
  autocompleteField(@Query('field') field: string, @Query('q') q = '', @CurrentUser() user: ReqUser, @Req() req: Request) {
    return this.svc.autocompleteField(field, q, getActiveOrgId(user, req));
  }

  // ── Remote signing — PUBLIC ──────────────────────────────────────────────

  @Get('sign/:token')
  async getForSigning(@Param('token') token: string) {
    return this.svc.getNoteForSigning(token);
  }

  @Post('sign/:token')
  async submitSignature(
    @Param('token') token: string,
    @Body() body: { signerName: string; signerRole?: string; signature: string },
  ) {
    return this.svc.submitRemoteSignature(token, body.signerName, body.signerRole, body.signature);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/signing-link')
  async createSigningLink(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ReqUser,
    @Req() req: Request,
  ) {
    return this.svc.createSigningLink(id, getActiveOrgId(user, req));
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser, @Req() req: Request) {
    return this.svc.findOne(id, getActiveOrgId(user, req));
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: any, @CurrentUser() user: ReqUser, @Req() req: Request) {
    const lessorName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username;
    return this.svc.create(getActiveOrgId(user, req), user.id, {
      ...dto,
      lessorSignerName: dto.lessorSignerName ?? lessorName,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: ReqUser, @Req() req: Request) {
    return this.svc.update(id, getActiveOrgId(user, req), dto);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser, @Req() req: Request) {
    return this.svc.remove(id, getActiveOrgId(user, req));
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/pdf')
  async storePdf(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { pdf: string },
    @CurrentUser() user: ReqUser,
    @Req() req: Request,
  ) {
    const buffer = Buffer.from(body.pdf, 'base64');
    const path = await this.svc.storePdf(id, getActiveOrgId(user, req), user.id, buffer);
    return { path };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/pdf')
  async downloadPdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser, @Req() req: Request, @Res() res: Response) {
    const { buffer, filename } = await this.svc.downloadPdf(id, getActiveOrgId(user, req));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"` });
    res.send(buffer);
  }
}
