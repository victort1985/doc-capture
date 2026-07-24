import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(@CurrentUser() user: ReqUser, @Query('orgId') orgId?: string) {
    const effectiveOrgId = user.organizationId == null && orgId ? Number(orgId) : user.organizationId;
    return this.paymentsService.findAll(effectiveOrgId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.paymentsService.findOne(id, user.organizationId);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser, @Res() res: Response) {
    const buffer = await this.paymentsService.getPdfBuffer(id, user.organizationId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="payment-${id}.pdf"` });
    res.send(buffer);
  }

  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: ReqUser) {
    return this.paymentsService.create(user.organizationId, user.id, dto);
  }

  @Post(':id/regenerate-pdf')
  regeneratePdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    return this.paymentsService.regeneratePdf(id, user.organizationId);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    await this.paymentsService.remove(id, user.organizationId);
    return { deleted: true };
  }
}
