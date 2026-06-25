import {
  Body, Controller, Delete, Get, Param, ParseIntPipe,
  Patch, Post, Query, Res, SetMetadata, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { DeliveryNotesService } from './delivery-notes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const SkipAuth = () => SetMetadata('skipAuth', true);
type ReqUser = { id: number; organizationId: number | null };

@Controller('delivery-notes')
export class DeliveryNotesController {
  constructor(private readonly svc: DeliveryNotesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@CurrentUser() user: ReqUser) {
    return this.svc.findAll(user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('autocomplete/clients')
  autocompleteClients(@Query('q') q = '', @CurrentUser() user: ReqUser) {
    return this.svc.autocompleteClients(q, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('autocomplete/field')
  autocompleteField(@Query('field') field: string, @Query('q') q = '', @CurrentUser() user: ReqUser) {
    return this.svc.autocompleteField(field, q, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.svc.findOne(id, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: any, @CurrentUser() user: ReqUser) {
    return this.svc.create(user.organizationId, user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: ReqUser) {
    return this.svc.update(id, user.organizationId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.svc.remove(id, user.organizationId);
  }

  /** Client uploads generated PDF (with embedded signatures) */
  @UseGuards(JwtAuthGuard)
  @Post(':id/pdf')
  async storePdf(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { pdf: string }, // base64
    @CurrentUser() user: ReqUser,
  ) {
    const buffer = Buffer.from(body.pdf, 'base64');
    const path = await this.svc.storePdf(id, user.organizationId, user.id, buffer);
    return { path };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/pdf')
  async downloadPdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser, @Res() res: Response) {
    const { buffer, filename } = await this.svc.downloadPdf(id, user.organizationId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"` });
    res.send(buffer);
  }

  // ── Remote signing ─────────────────────────────────────────────────────

  /** POST /delivery-notes/:id/signing-link — generate a one-time signing token */
  @UseGuards(JwtAuthGuard)
  @Post(':id/signing-link')
  async createSigningLink(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: ReqUser,
  ) {
    return this.svc.createSigningLink(id, user.organizationId);
  }

  /** GET /delivery-notes/sign/:token — PUBLIC — returns note data in Hebrew for the signer */
  @Get('sign/:token')
  async getForSigning(@Param('token') token: string) {
    return this.svc.getNoteForSigning(token);
  }

  /** POST /delivery-notes/sign/:token — PUBLIC — submit signer info + signature */
  @Post('sign/:token')
  async submitSignature(
    @Param('token') token: string,
    @Body() body: { signerName: string; signerRole?: string; signature: string },
  ) {
    return this.svc.submitRemoteSignature(token, body.signerName, body.signerRole, body.signature);
  }
}
