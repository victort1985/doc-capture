import { Controller, Get, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

type ReqUser = { organizationId: number | null };

@Controller('accounting')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AccountingController {
  constructor(private readonly service: AccountingService) {}

  @Get('accounts')
  findAllAccounts(@CurrentUser() user: ReqUser) {
    return this.service.findAllAccounts(user.organizationId);
  }

  @Post('accounts/seed-defaults')
  seedDefaults(@CurrentUser() user: ReqUser) {
    if (user.organizationId == null) return [];
    return this.service.seedDefaultAccounts(user.organizationId);
  }

  @Get('trial-balance')
  trialBalance(@CurrentUser() user: ReqUser, @Query('from') from: string, @Query('to') to: string) {
    return this.service.trialBalance(user.organizationId, from, to);
  }

  @Get('profit-and-loss')
  profitAndLoss(@CurrentUser() user: ReqUser, @Query('from') from: string, @Query('to') to: string) {
    return this.service.profitAndLoss(user.organizationId, from, to);
  }

  @Get('vat-summary')
  vatSummary(@CurrentUser() user: ReqUser, @Query('from') from: string, @Query('to') to: string) {
    return this.service.vatSummary(user.organizationId, from, to);
  }

  @Get('cash-flow')
  cashFlow(@CurrentUser() user: ReqUser, @Query('from') from: string, @Query('to') to: string) {
    return this.service.cashFlowStatement(user.organizationId, from, to);
  }

  @Get('balance-sheet')
  balanceSheet(@CurrentUser() user: ReqUser, @Query('asOf') asOf: string) {
    return this.service.balanceSheet(user.organizationId, asOf);
  }

  @Get('general-ledger/:accountId')
  generalLedger(
    @Param('accountId', ParseIntPipe) accountId: number,
    @CurrentUser() user: ReqUser,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.service.generalLedger(user.organizationId, accountId, from, to);
  }

  /** Requirement #14 ("Excel") — a single workbook with one sheet per
   * report, rather than separate CSV downloads per report, since an
   * accountant reviewing the books wants all of them together, not
   * four separate files to keep track of. */
  @Get('export.xlsx')
  async exportXlsx(@CurrentUser() user: ReqUser, @Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const buffer = await this.service.exportWorkbook(user.organizationId, from, to);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="accounting_${from}_${to}.xlsx"`,
    });
    res.send(buffer);
  }

  /** General ledger detail as plain CSV — separate from export.xlsx's
   * own multi-tab workbook because a plain CSV of just the
   * transaction-level journal is what most OTHER accounting software
   * and external bookkeeping firms actually want to import, versus a
   * multi-sheet Excel file meant for a person to read directly. */
  @Get('export-journal.csv')
  async exportJournalCsv(@CurrentUser() user: ReqUser, @Query('from') from: string, @Query('to') to: string, @Res() res: Response) {
    const rows = await this.service.allLedgerEntries(user.organizationId, from, to);
    const escape = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ['Date', 'Description', 'Debit Account Code', 'Debit Account', 'Credit Account Code', 'Credit Account', 'Amount', 'Source Type', 'Source ID'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([r.date, r.description, r.debitAccountCode, r.debitAccountName, r.creditAccountCode, r.creditAccountName, r.amount, r.sourceType, r.sourceId].map(escape).join(','));
    }
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="general_ledger_${from}_${to}.csv"`,
    });
    res.send('\uFEFF' + lines.join('\n')); // BOM so Excel opens Hebrew/UTF-8 content correctly rather than mangling it
  }
}
