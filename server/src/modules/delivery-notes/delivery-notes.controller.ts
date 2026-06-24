import {
  Body, Controller, Delete, Get, Param, ParseIntPipe,
  Patch, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { DeliveryNotesService } from './delivery-notes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('delivery-notes')
@UseGuards(JwtAuthGuard)
export class DeliveryNotesController {
  constructor(private readonly svc: DeliveryNotesService) {}

  @Get()
  findAll(@CurrentUser() user: ReqUser) {
    return this.svc.findAll(user.organizationId);
  }

  @Get('autocomplete/clients')
  autocompleteClients(@Query('q') q = '', @CurrentUser() user: ReqUser) {
    return this.svc.autocompleteClients(q, user.organizationId);
  }

  @Get('autocomplete/field')
  autocompleteField(@Query('field') field: string, @Query('q') q = '', @CurrentUser() user: ReqUser) {
    return this.svc.autocompleteField(field, q, user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.svc.findOne(id, user.organizationId);
  }

  @Post()
  create(@Body() dto: any, @CurrentUser() user: ReqUser) {
    return this.svc.create(user.organizationId, user.id, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: ReqUser) {
    return this.svc.update(id, user.organizationId, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.svc.remove(id, user.organizationId);
  }

  /** Client uploads generated PDF (with embedded signatures) */
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

  @Get(':id/pdf')
  async downloadPdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser, @Res() res: Response) {
    const { buffer, filename } = await this.svc.downloadPdf(id, user.organizationId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"` });
    res.send(buffer);
  }
}
