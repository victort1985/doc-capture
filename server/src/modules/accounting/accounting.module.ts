import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { BankStatementLine } from './entities/bank-statement-line.entity';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { LedgerPostingService } from './ledger-posting.service';
import { BankReconciliationService } from './bank-reconciliation.service';
import { BankReconciliationController } from './bank-reconciliation.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Account, LedgerEntry, BankStatementLine])],
  controllers: [AccountingController, BankReconciliationController],
  providers: [AccountingService, LedgerPostingService, BankReconciliationService],
  exports: [AccountingService, LedgerPostingService],
})
export class AccountingModule {}
