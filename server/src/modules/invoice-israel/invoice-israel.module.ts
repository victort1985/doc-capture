import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxAuthoritySettings } from './entities/tax-authority-settings.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { TaxAuthorityOAuthService } from './tax-authority-oauth.service';
import { TaxAuthorityInvoiceApiService } from './tax-authority-invoice-api.service';
import { TaxAuthoritySettingsService } from './tax-authority-settings.service';
import { TaxAuthorityAllocationService } from './tax-authority-allocation.service';
import { TaxAuthorityController } from './tax-authority.controller';
import { TaxAuthorityCallbackController } from './tax-authority-callback.controller';

@Module({
  imports: [TypeOrmModule.forFeature([TaxAuthoritySettings, Invoice])],
  controllers: [TaxAuthorityController, TaxAuthorityCallbackController],
  providers: [
    TaxAuthorityOAuthService,
    TaxAuthorityInvoiceApiService,
    TaxAuthoritySettingsService,
    TaxAuthorityAllocationService,
  ],
  exports: [TaxAuthorityAllocationService],
})
export class InvoiceIsraelModule {}
