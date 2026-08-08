import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecurringTemplate } from '../accounting/entities/recurring-template.entity';
import { RecurringDocumentsService } from './recurring-documents.service';
import { RecurringDocumentsController } from './recurring-documents.controller';
import { ExpensesModule } from '../expenses/expenses.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [TypeOrmModule.forFeature([RecurringTemplate]), ExpensesModule, InvoicesModule],
  controllers: [RecurringDocumentsController],
  providers: [RecurringDocumentsService],
})
export class RecurringDocumentsModule {}
