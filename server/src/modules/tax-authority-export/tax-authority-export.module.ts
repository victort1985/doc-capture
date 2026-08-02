import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { LedgerEntry } from '../accounting/entities/ledger-entry.entity';
import { Account } from '../accounting/entities/account.entity';
import { WarehouseItem } from '../warehouse/entities/warehouse-item.entity';
import { WarehouseTransaction } from '../warehouse/entities/warehouse-transaction.entity';
import { TaxAuthoritySettings } from '../invoice-israel/entities/tax-authority-settings.entity';
import { Organization } from '../organizations/entities/organization.entity';
import { OpenFormatExportService } from './open-format-export.service';
import { TaxAuthorityExportController } from './tax-authority-export.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Invoice, LedgerEntry, Account, WarehouseItem, WarehouseTransaction, TaxAuthoritySettings, Organization,
    ]),
  ],
  providers: [OpenFormatExportService],
  controllers: [TaxAuthorityExportController],
})
export class TaxAuthorityExportModule {}
