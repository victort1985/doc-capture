import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { BankStatementLine } from './entities/bank-statement-line.entity';
import { TaxAdvancePaymentSettings } from './entities/tax-advance-payment-settings.entity';
import { TaxAdvancePaymentRecord } from './entities/tax-advance-payment-record.entity';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { LedgerPostingService } from './ledger-posting.service';
import { BankReconciliationService } from './bank-reconciliation.service';
import { BankReconciliationController } from './bank-reconciliation.controller';
import { TaxAdvancePaymentService } from './tax-advance-payment.service';
import { TaxAdvancePaymentController } from './tax-advance-payment.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Account, LedgerEntry, BankStatementLine, TaxAdvancePaymentSettings, TaxAdvancePaymentRecord])],
  controllers: [AccountingController, BankReconciliationController, TaxAdvancePaymentController],
  providers: [AccountingService, LedgerPostingService, BankReconciliationService, TaxAdvancePaymentService],
  exports: [AccountingService, LedgerPostingService],
})
export class AccountingModule {}
