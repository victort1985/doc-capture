import { Body, Controller, Get, Param, ParseIntPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { MarkSupplierInvoicePaidDto } from './dto/mark-supplier-invoice-paid.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  findAll(@CurrentUser() user: ReqUser) {
    return this.service.findAllExpenses(user.organizationId);
  }

  @Post()
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: ReqUser) {
    return this.service.createExpense(user.organizationId, user.id, dto);
  }

  /** Requirement #14 ("import") — CSV columns: date,description,
   * category,amount,method (method optional, defaults to cash).
   * Header row required, order doesn't matter — matched by name. */
  @Post('import-csv')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(@UploadedFile() file: { buffer: Buffer }, @CurrentUser() user: ReqUser) {
    return this.service.importExpensesCsv(user.organizationId, user.id, file.buffer.toString('utf-8'));
  }

  @Post(':id/receipt')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  attachReceipt(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: { originalname: string; buffer: Buffer },
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.attachExpenseReceipt(id, user.organizationId, user.id, file);
  }

  @Get(':id/receipt')
  async getReceipt(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser, @Res() res: Response) {
    const buffer = await this.service.getExpenseReceipt(id, user.organizationId, user.id);
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `inline; filename="receipt-${id}"` });
    res.send(buffer);
  }
}

@Controller('supplier-invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SupplierInvoicesController {
  constructor(private readonly service: ExpensesService) {}

  @Get()
  findAll(@CurrentUser() user: ReqUser) {
    return this.service.findAllSupplierInvoices(user.organizationId);
  }

  @Post()
  create(@Body() dto: CreateSupplierInvoiceDto, @CurrentUser() user: ReqUser) {
    return this.service.createSupplierInvoice(user.organizationId, user.id, dto);
  }

  @Post(':id/mark-paid')
  markPaid(@Param('id', ParseIntPipe) id: number, @Body() body: MarkSupplierInvoicePaidDto, @CurrentUser() user: ReqUser) {
    return this.service.markSupplierInvoicePaid(id, user.organizationId, body);
  }

  /** CSV columns: supplierName,invoiceNumber,date,dueDate,amount,
   * description. Header row required, order doesn't matter. */
  @Post('import-csv')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(@UploadedFile() file: { buffer: Buffer }, @CurrentUser() user: ReqUser) {
    return this.service.importSupplierInvoicesCsv(user.organizationId, user.id, file.buffer.toString('utf-8'));
  }

  @Post(':id/bill')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  attachBill(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: { originalname: string; buffer: Buffer },
    @CurrentUser() user: ReqUser,
  ) {
    return this.service.attachSupplierInvoiceBill(id, user.organizationId, user.id, file);
  }

  @Get(':id/bill')
  async getBill(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser, @Res() res: Response) {
    const buffer = await this.service.getSupplierInvoiceBill(id, user.organizationId, user.id);
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `inline; filename="bill-${id}"` });
    res.send(buffer);
  }
}
