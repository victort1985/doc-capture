import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Expense } from './entities/expense.entity';
import { SupplierInvoice } from './entities/supplier-invoice.entity';
import { ExpensesService } from './expenses.service';
import { ExpenseReceiptParserService } from './expense-receipt-parser.service';
import { ExpensesController, SupplierInvoicesController } from './expenses.controller';
import { AccountingModule } from '../accounting/accounting.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, SupplierInvoice]), AccountingModule, StorageModule],
  controllers: [ExpensesController, SupplierInvoicesController],
  providers: [ExpensesService, ExpenseReceiptParserService],
})
export class ExpensesModule {}
