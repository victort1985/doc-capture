import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostCenter } from './entities/cost-center.entity';
import { Expense } from '../expenses/entities/expense.entity';
import { SupplierInvoice } from '../expenses/entities/supplier-invoice.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { CostCentersService } from './cost-centers.service';
import { CostCentersController } from './cost-centers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CostCenter, Expense, SupplierInvoice, Invoice])],
  controllers: [CostCentersController],
  providers: [CostCentersService],
  exports: [TypeOrmModule],
})
export class CostCentersModule {}
