import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { LedgerPostingService } from './ledger-posting.service';

@Module({
  imports: [TypeOrmModule.forFeature([Account, LedgerEntry])],
  controllers: [AccountingController],
  providers: [AccountingService, LedgerPostingService],
  exports: [AccountingService, LedgerPostingService],
})
export class AccountingModule {}
