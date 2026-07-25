import { Body, Controller, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
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
}
