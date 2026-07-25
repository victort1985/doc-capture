import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from './entities/expense.entity';
import { SupplierInvoice } from './entities/supplier-invoice.entity';
import { ExpensesService } from './expenses.service';
import { ExpensesController, SupplierInvoicesController } from './expenses.controller';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, SupplierInvoice]), AccountingModule],
  controllers: [ExpensesController, SupplierInvoicesController],
  providers: [ExpensesService],
})
export class ExpensesModule {}
