import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('invoices')
@UseGuards(JwtAuthGuard)
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Get()
  findAll(@CurrentUser() user: ReqUser) {
    return this.invoicesService.findAll(user.organizationId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.invoicesService.findOne(id, user.organizationId);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser, @Res() res: Response) {
    const buffer = await this.invoicesService.getPdfBuffer(id, user.organizationId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="invoice-${id}.pdf"` });
    res.send(buffer);
  }

  @Post()
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: ReqUser) {
    return this.invoicesService.create(user.organizationId, user.id, dto);
  }

  @Post(':id/send')
  markSent(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.invoicesService.markSent(id, user.organizationId);
  }

  @Post(':id/mark-paid')
  markPaid(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.invoicesService.markPaid(id, user.organizationId);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    await this.invoicesService.remove(id, user.organizationId);
    return { deleted: true };
  }
}
