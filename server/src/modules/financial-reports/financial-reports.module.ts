import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceSettings } from '../invoices/entities/invoice-settings.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { Payment } from '../payments/entities/payment.entity';
import { FinancialReportsController } from './financial-reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, InvoiceSettings, Quote, Payment])],
  controllers: [FinancialReportsController],
})
export class FinancialReportsModule {}
