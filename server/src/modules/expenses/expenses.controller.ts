import { Body, Controller, Get, Param, ParseIntPipe, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { id: number; organizationId: number | null };

@Controller('expenses')
@UseGuards(JwtAuthGuard)
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
}

@Controller('supplier-invoices')
@UseGuards(JwtAuthGuard)
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
  markPaid(@Param('id', ParseIntPipe) id: number, @Body() body: { method?: 'cash' | 'bank' }, @CurrentUser() user: ReqUser) {
    return this.service.markSupplierInvoicePaid(id, user.organizationId, body.method ?? 'cash');
  }

  /** CSV columns: supplierName,invoiceNumber,date,dueDate,amount,
   * description. Header row required, order doesn't matter. */
  @Post('import-csv')
  @UseInterceptors(FileInterceptor('file'))
  async importCsv(@UploadedFile() file: { buffer: Buffer }, @CurrentUser() user: ReqUser) {
    return this.service.importSupplierInvoicesCsv(user.organizationId, user.id, file.buffer.toString('utf-8'));
  }
}
