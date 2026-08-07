import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account, AccountType } from './entities/account.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';

/** Standard starter chart of accounts (requirement #7) — codes follow
 * the common convention of grouping by leading digit (1xxx assets,
 * 2xxx liabilities, 3xxx equity, 4xxx revenue, 5xxx expenses). System
 * accounts (isSystem: true) are what LedgerPostingService posts
 * against automatically; an org can still add its own on top (e.g.
 * specific expense categories) without touching these. */
const DEFAULT_ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  { code: '1000', name: 'קופה (Cash)', type: AccountType.ASSET },
  { code: '1010', name: 'בנק (Bank)', type: AccountType.ASSET },
  { code: '1100', name: 'לקוחות (Accounts Receivable)', type: AccountType.ASSET },
  { code: '1200', name: 'מע"מ תשומות (Input VAT Receivable)', type: AccountType.ASSET },
  { code: '2100', name: 'מע"מ עסקאות (VAT Payable)', type: AccountType.LIABILITY },
  { code: '2000', name: 'ספקים (Accounts Payable)', type: AccountType.LIABILITY },
  { code: '3000', name: 'הון עצמי (Owner\'s Equity)', type: AccountType.EQUITY },
  { code: '4000', name: 'הכנסות ממכירות (Sales Revenue)', type: AccountType.REVENUE },
  { code: '5000', name: 'הוצאות כלליות (General Expenses)', type: AccountType.EXPENSE },
  { code: '5100', name: 'קניות מספקים (Purchases)', type: AccountType.EXPENSE },
];

@Injectable()
export class AccountingService {
  constructor(
    @InjectRepository(Account) private readonly accountsRepo: Repository<Account>,
    @InjectRepository(LedgerEntry) private readonly ledgerRepo: Repository<LedgerEntry>,
  ) {}

  async seedDefaultAccounts(organizationId: number): Promise<Account[]> {
    const existingCodes = new Set((await this.accountsRepo.find({ where: { organization: { id: organizationId } } })).map((a) => a.code));
    const toCreate = DEFAULT_ACCOUNTS.filter((a) => !existingCodes.has(a.code));
    if (toCreate.length === 0) return [];
    return this.accountsRepo.save(
      toCreate.map((a) => this.accountsRepo.create({ ...a, isSystem: true, organization: { id: organizationId } as any })),
    );
  }

  async findAllAccounts(organizationId: number | null): Promise<Account[]> {
    return this.accountsRepo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { code: 'ASC' },
    });
  }

  /** Finds a system account by its well-known code — used by
   * LedgerPostingService, which always posts against these specific
   * accounts regardless of what else an org has added. Seeds them
   * on-demand if somehow missing (e.g. an org that existed before
   * this feature), rather than failing to post. */
  async getSystemAccount(organizationId: number, code: string): Promise<Account> {
    let account = await this.accountsRepo.findOne({ where: { organization: { id: organizationId }, code } });
    if (!account) {
      await this.seedDefaultAccounts(organizationId);
      account = await this.accountsRepo.findOne({ where: { organization: { id: organizationId }, code } });
    }
    if (!account) throw new Error(`System account ${code} could not be found or created for org ${organizationId}`);
    return account;
  }

  async postEntry(
    organizationId: number,
    date: string,
    description: string,
    debitAccountId: number,
    creditAccountId: number,
    amount: number,
    sourceType?: string,
    sourceId?: number,
  ): Promise<LedgerEntry> {
    // Idempotency guard — posting the same source document twice
    // (e.g. a retry) would silently double every balance.
    if (sourceType && sourceId) {
      const existing = await this.ledgerRepo.findOne({ where: { sourceType, sourceId, organization: { id: organizationId } } });
      if (existing) return existing;
    }
    const entry = this.ledgerRepo.create({
      date, description, amount,
      debitAccount: { id: debitAccountId } as any,
      creditAccount: { id: creditAccountId } as any,
      sourceType, sourceId,
      organization: { id: organizationId } as any,
    });
    return this.ledgerRepo.save(entry);
  }

  /** Trial balance (oborotno-saldovaya vedomost) — every account's
   * total debits/credits for the period, which by double-entry
   * construction always balances (sum of all debits === sum of all
   * credits) if every posting went through postEntry() correctly. */
  async trialBalance(organizationId: number | null, from: string, to: string) {
    const accounts = await this.findAllAccounts(organizationId);

    const debitQb = this.ledgerRepo
      .createQueryBuilder('e')
      .select('e."debitAccountId"', 'accountId')
      .addSelect('SUM(e.amount)', 'total')
      .where('e.date BETWEEN :from AND :to', { from, to })
      .groupBy('e."debitAccountId"');
    if (organizationId != null) debitQb.andWhere('e."organizationId" = :orgId', { orgId: organizationId });
    const debitSums = await debitQb.getRawMany<{ accountId: number; total: string }>();

    const creditQb = this.ledgerRepo
      .createQueryBuilder('e')
      .select('e."creditAccountId"', 'accountId')
      .addSelect('SUM(e.amount)', 'total')
      .where('e.date BETWEEN :from AND :to', { from, to })
      .groupBy('e."creditAccountId"');
    if (organizationId != null) creditQb.andWhere('e."organizationId" = :orgId', { orgId: organizationId });
    const creditSums = await creditQb.getRawMany<{ accountId: number; total: string }>();

    const debitMap = new Map(debitSums.map((r) => [r.accountId, Number(r.total)]));
    const creditMap = new Map(creditSums.map((r) => [r.accountId, Number(r.total)]));

    return accounts.map((a) => ({
      accountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debit: round2(debitMap.get(a.id) ?? 0),
      credit: round2(creditMap.get(a.id) ?? 0),
    }));
  }

  /** Profit & Loss (отчёт о прибылях и убытках) for a period — revenue
   * accounts net (credit total minus debit total, since revenue
   * increases with credits) minus expense accounts net (debit total
   * minus credit total, expenses increase with debits). Built
   * straight from trialBalance() rather than a separate query, so
   * there's exactly one place computing account totals to keep
   * correct. */
  async profitAndLoss(organizationId: number | null, from: string, to: string) {
    const balances = await this.trialBalance(organizationId, from, to);
    const revenueRows = balances.filter((b) => b.type === AccountType.REVENUE);
    const expenseRows = balances.filter((b) => b.type === AccountType.EXPENSE);

    const totalRevenue = round2(revenueRows.reduce((sum, r) => sum + (r.credit - r.debit), 0));
    const totalExpenses = round2(expenseRows.reduce((sum, r) => sum + (r.debit - r.credit), 0));

    return {
      period: { from, to },
      revenue: revenueRows.map((r) => ({ code: r.code, name: r.name, amount: round2(r.credit - r.debit) })),
      totalRevenue,
      expenses: expenseRows.map((r) => ({ code: r.code, name: r.name, amount: round2(r.debit - r.credit) })),
      totalExpenses,
      netProfit: round2(totalRevenue - totalExpenses),
    };
  }

  /** Balance sheet (баланс) as of a given date — Assets should equal
   * Liabilities + Equity + (retained earnings from net profit to
   * date, folded into equity here since there's no separate closing-
   * entry step in this simplified system). Cumulative from the
   * beginning of time to `asOf`, unlike the trial balance/P&L which
   * are period-scoped — a balance sheet is a snapshot, not a period
   * summary. */
  async balanceSheet(organizationId: number | null, asOf: string) {
    const epoch = '1970-01-01';
    const balances = await this.trialBalance(organizationId, epoch, asOf);
    const netToDate = await this.profitAndLoss(organizationId, epoch, asOf);

    const assets = balances.filter((b) => b.type === AccountType.ASSET).map((a) => ({ code: a.code, name: a.name, balance: round2(a.debit - a.credit) }));
    const liabilities = balances.filter((b) => b.type === AccountType.LIABILITY).map((a) => ({ code: a.code, name: a.name, balance: round2(a.credit - a.debit) }));
    const equity = balances.filter((b) => b.type === AccountType.EQUITY).map((a) => ({ code: a.code, name: a.name, balance: round2(a.credit - a.debit) }));

    const totalAssets = round2(assets.reduce((s, a) => s + a.balance, 0));
    const totalLiabilities = round2(liabilities.reduce((s, a) => s + a.balance, 0));
    const totalEquity = round2(equity.reduce((s, a) => s + a.balance, 0) + netToDate.netProfit);

    return {
      asOf,
      assets, totalAssets,
      liabilities, totalLiabilities,
      equity, retainedEarnings: netToDate.netProfit, totalEquity,
      balances: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    };
  }

  /** General ledger for one account — every entry that touched it,
   * in date order, with a running balance. */
  async generalLedger(organizationId: number | null, accountId: number, from: string, to: string) {
    const qb = this.ledgerRepo
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.debitAccount', 'debitAccount')
      .leftJoinAndSelect('e.creditAccount', 'creditAccount')
      .where('(e."debitAccountId" = :accountId OR e."creditAccountId" = :accountId)', { accountId })
      .andWhere('e.date BETWEEN :from AND :to', { from, to })
      .orderBy('e.date', 'ASC')
      .addOrderBy('e.id', 'ASC');
    if (organizationId != null) qb.andWhere('e."organizationId" = :orgId', { orgId: organizationId });
    const rows = await qb.getMany();

    let balance = 0;
    return rows.map((e) => {
      const isDebit = e.debitAccount.id === accountId;
      balance += isDebit ? Number(e.amount) : -Number(e.amount);
      return {
        id: e.id, date: e.date, description: e.description,
        debit: isDebit ? Number(e.amount) : 0,
        credit: !isDebit ? Number(e.amount) : 0,
        balance: round2(balance),
        sourceType: e.sourceType, sourceId: e.sourceId,
      };
    });
  }
  /** VAT summary (דוח תקופתי מע"מ) — output VAT collected on sales
   * (net credit to account 2100) minus input VAT paid on deductible
   * purchases (net debit to account 1200, the new account this same
   * VAT-tracking feature added — see Expense.vatAmount's own doc
   * comment). Positive netVat is owed to the Tax Authority for the
   * period; negative means a refund is due. This is a simple summary
   * for an accountant to sanity-check before filing the real bimonthly
   * return — NOT a replacement for the actual Tax Authority "Open
   * Format" export (see the tax-authority-export module), which is
   * the file that gets submitted. */
  async vatSummary(organizationId: number | null, from: string, to: string) {
    const balances = await this.trialBalance(organizationId, from, to);
    const outputRow = balances.find((b) => b.code === '2100');
    const inputRow = balances.find((b) => b.code === '1200');
    const outputVat = round2((outputRow?.credit ?? 0) - (outputRow?.debit ?? 0));
    const inputVat = round2((inputRow?.debit ?? 0) - (inputRow?.credit ?? 0));
    return {
      period: { from, to },
      outputVat,
      inputVat,
      netVat: round2(outputVat - inputVat),
    };
  }

  /** Requirement #14 (\"Excel\") — everything AccountingService already
   * knows how to compute, as one workbook. Reuses trialBalance/
   * profitAndLoss/balanceSheet rather than re-deriving anything, so
   * the numbers in the spreadsheet always match what the admin panel
   * itself shows for the same period. */
  async exportWorkbook(organizationId: number | null, from: string, to: string): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();

    const trial = await this.trialBalance(organizationId, from, to);
    const trialSheet = workbook.addWorksheet('Trial Balance');
    trialSheet.columns = [
      { header: 'Code', key: 'code', width: 10 },
      { header: 'Account', key: 'name', width: 30 },
      { header: 'Type', key: 'type', width: 12 },
      { header: 'Debit', key: 'debit', width: 14 },
      { header: 'Credit', key: 'credit', width: 14 },
    ];
    trialSheet.addRows(trial);

    const pnl = await this.profitAndLoss(organizationId, from, to);
    const pnlSheet = workbook.addWorksheet('Profit & Loss');
    pnlSheet.columns = [{ header: 'Code', key: 'code', width: 10 }, { header: 'Account', key: 'name', width: 30 }, { header: 'Amount', key: 'amount', width: 14 }];
    pnlSheet.addRow(['', 'REVENUE', '']);
    pnlSheet.addRows(pnl.revenue);
    pnlSheet.addRow(['', 'Total Revenue', pnl.totalRevenue]);
    pnlSheet.addRow([]);
    pnlSheet.addRow(['', 'EXPENSES', '']);
    pnlSheet.addRows(pnl.expenses);
    pnlSheet.addRow(['', 'Total Expenses', pnl.totalExpenses]);
    pnlSheet.addRow([]);
    pnlSheet.addRow(['', 'Net Profit', pnl.netProfit]);

    const balance = await this.balanceSheet(organizationId, to);
    const balanceSheetTab = workbook.addWorksheet('Balance Sheet');
    balanceSheetTab.columns = [{ header: 'Code', key: 'code', width: 10 }, { header: 'Account', key: 'name', width: 30 }, { header: 'Balance', key: 'balance', width: 14 }];
    balanceSheetTab.addRow(['', 'ASSETS', '']);
    balanceSheetTab.addRows(balance.assets);
    balanceSheetTab.addRow(['', 'Total Assets', balance.totalAssets]);
    balanceSheetTab.addRow([]);
    balanceSheetTab.addRow(['', 'LIABILITIES', '']);
    balanceSheetTab.addRows(balance.liabilities);
    balanceSheetTab.addRow(['', 'Total Liabilities', balance.totalLiabilities]);
    balanceSheetTab.addRow([]);
    balanceSheetTab.addRow(['', 'EQUITY', '']);
    balanceSheetTab.addRows(balance.equity);
    balanceSheetTab.addRow(['', 'Retained Earnings', balance.retainedEarnings]);
    balanceSheetTab.addRow(['', 'Total Equity', balance.totalEquity]);

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
