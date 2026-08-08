import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { BankStatementLine, BankLineStatus } from './entities/bank-statement-line.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { Account } from './entities/account.entity';
import { parseBankStatement } from './bank-statement-parser';

const BANK_LIKE_ACCOUNT_CODES = ['1000', '1010']; // Cash, Bank — see AccountingService's DEFAULT_ACCOUNTS
const MATCH_DATE_WINDOW_DAYS = 5;
const MATCH_AMOUNT_TOLERANCE = 0.01; // rounding-only tolerance, not a fuzzy match

export interface MatchSuggestion {
  ledgerEntryId: number;
  date: string;
  description: string;
  amount: number; // signed the same way as the statement line, for direct comparison
  daysApart: number;
}

@Injectable()
export class BankReconciliationService {
  constructor(
    @InjectRepository(BankStatementLine) private readonly linesRepo: Repository<BankStatementLine>,
    @InjectRepository(LedgerEntry) private readonly ledgerRepo: Repository<LedgerEntry>,
    @InjectRepository(Account) private readonly accountsRepo: Repository<Account>,
  ) {}

  /** Imports one bank statement file, storing every parsed row as its
   * own unmatched line — matching happens as a separate step (see
   * suggestMatches/confirmMatch below) so a bad auto-match never
   * silently reconciles the wrong thing; a person always confirms. */
  async importStatement(organizationId: number, buffer: Buffer, fileName: string): Promise<{ importBatchId: string; count: number }> {
    const parsed = await parseBankStatement(buffer, fileName);
    const importBatchId = randomUUID();
    const entities = parsed.map((line) =>
      this.linesRepo.create({
        date: line.date,
        description: line.description,
        amount: line.amount,
        reference: line.reference,
        status: BankLineStatus.UNMATCHED,
        importBatchId,
        organization: { id: organizationId } as any,
      }),
    );
    await this.linesRepo.save(entities);
    return { importBatchId, count: entities.length };
  }

  async listLines(organizationId: number, status?: BankLineStatus): Promise<BankStatementLine[]> {
    return this.linesRepo.find({
      where: { organization: { id: organizationId }, ...(status ? { status } : {}) },
      relations: ['matchedLedgerEntry'],
      order: { date: 'DESC', id: 'DESC' },
    });
  }

  /** Candidate ledger entries for one statement line: same signed
   * direction (a deposit only ever matches a debit to a bank/cash
   * account, a withdrawal only a credit — money movement has to
   * agree, not just the absolute amount), within a date window (bank
   * clearing delay is real — a check written on the 28th might not
   * clear until the 2nd), amount matching to the cent. Only looks at
   * Cash/Bank account postings, since those are the only ledger
   * entries a bank statement could ever correspond to. Excludes
   * entries already matched to a DIFFERENT line so the same ledger
   * entry never gets suggested twice. */
  async suggestMatches(organizationId: number, lineId: number): Promise<MatchSuggestion[]> {
    const line = await this.linesRepo.findOne({ where: { id: lineId, organization: { id: organizationId } } });
    if (!line) throw new NotFoundException('Statement line not found');

    const bankAccounts = await this.accountsRepo.find({
      where: BANK_LIKE_ACCOUNT_CODES.map((code) => ({ code, organization: { id: organizationId } })),
    });
    if (bankAccounts.length === 0) return [];
    const bankAccountIds = bankAccounts.map((a) => a.id);

    const dateFrom = shiftDate(line.date, -MATCH_DATE_WINDOW_DAYS);
    const dateTo = shiftDate(line.date, MATCH_DATE_WINDOW_DAYS);

    const qb = this.ledgerRepo.createQueryBuilder('entry')
      .leftJoinAndSelect('entry.debitAccount', 'debitAccount')
      .leftJoinAndSelect('entry.creditAccount', 'creditAccount')
      .leftJoin('entry.organization', 'organization')
      .where('organization.id = :orgId', { orgId: organizationId })
      .andWhere('entry.date >= :dateFrom AND entry.date <= :dateTo', { dateFrom, dateTo })
      .andWhere('entry.amount >= :lo AND entry.amount <= :hi', {
        lo: Math.abs(line.amount) - MATCH_AMOUNT_TOLERANCE,
        hi: Math.abs(line.amount) + MATCH_AMOUNT_TOLERANCE,
      });

    if (line.amount > 0) {
      // Deposit — bank/cash account was debited (balance went up)
      qb.andWhere('entry."debitAccountId" IN (:...ids)', { ids: bankAccountIds });
    } else {
      // Withdrawal — bank/cash account was credited (balance went down)
      qb.andWhere('entry."creditAccountId" IN (:...ids)', { ids: bankAccountIds });
    }

    const alreadyMatched = await this.linesRepo.find({
      where: { organization: { id: organizationId }, status: BankLineStatus.MATCHED },
      relations: ['matchedLedgerEntry'],
    });
    const takenEntryIds = new Set(alreadyMatched.map((l) => l.matchedLedgerEntry?.id).filter(Boolean));

    const candidates = await qb.getMany();
    return candidates
      .filter((e) => !takenEntryIds.has(e.id))
      .map((e) => ({
        ledgerEntryId: e.id,
        date: e.date,
        description: e.description,
        amount: line.amount > 0 ? e.amount : -e.amount,
        daysApart: Math.abs(daysBetween(line.date, e.date)),
      }))
      .sort((a, b) => a.daysApart - b.daysApart);
  }

  async confirmMatch(organizationId: number, lineId: number, ledgerEntryId: number): Promise<BankStatementLine> {
    const line = await this.linesRepo.findOne({ where: { id: lineId, organization: { id: organizationId } } });
    if (!line) throw new NotFoundException('Statement line not found');
    const entry = await this.ledgerRepo.findOne({ where: { id: ledgerEntryId }, relations: ['organization'] });
    if (!entry || entry.organization?.id !== organizationId) throw new NotFoundException('Ledger entry not found');

    line.status = BankLineStatus.MATCHED;
    line.matchedLedgerEntry = entry;
    return this.linesRepo.save(line);
  }

  async unmatch(organizationId: number, lineId: number): Promise<BankStatementLine> {
    const line = await this.linesRepo.findOne({ where: { id: lineId, organization: { id: organizationId } } });
    if (!line) throw new NotFoundException('Statement line not found');
    line.status = BankLineStatus.UNMATCHED;
    line.matchedLedgerEntry = null;
    return this.linesRepo.save(line);
  }

  /** For statement lines that will never have a ledger counterpart
   * worth recording as a separate document (e.g. a bank fee small
   * enough the org doesn't bother booking individually) — keeps it
   * out of the "still needs attention" unmatched list without
   * pretending it was matched to something. */
  async ignoreLine(organizationId: number, lineId: number): Promise<BankStatementLine> {
    const line = await this.linesRepo.findOne({ where: { id: lineId, organization: { id: organizationId } } });
    if (!line) throw new NotFoundException('Statement line not found');
    line.status = BankLineStatus.IGNORED;
    return this.linesRepo.save(line);
  }

  /** Deletes every line from one import — for undoing an accidental
   * duplicate upload of the same statement. Only allowed while every
   * line in the batch is still unmatched or ignored; a batch with any
   * confirmed match can't be bulk-deleted, to avoid silently losing a
   * reconciliation someone already did. */
  async deleteBatch(organizationId: number, importBatchId: string): Promise<{ deleted: number }> {
    const lines = await this.linesRepo.find({ where: { organization: { id: organizationId }, importBatchId } });
    if (lines.length === 0) throw new NotFoundException('Import batch not found');
    if (lines.some((l) => l.status === BankLineStatus.MATCHED)) {
      throw new BadRequestException('This batch has confirmed matches — unmatch those lines individually before deleting the whole batch.');
    }
    await this.linesRepo.remove(lines);
    return { deleted: lines.length };
  }

  /** Summary for the reconciliation page's own header: how many lines
   * are still unmatched, and the resulting unreconciled amount — the
   * two numbers that actually tell someone whether they're done. */
  async summary(organizationId: number): Promise<{ unmatchedCount: number; unmatchedAmount: number; matchedCount: number }> {
    const unmatched = await this.linesRepo.find({ where: { organization: { id: organizationId }, status: BankLineStatus.UNMATCHED } });
    const matchedCount = await this.linesRepo.count({ where: { organization: { id: organizationId }, status: BankLineStatus.MATCHED } });
    return {
      unmatchedCount: unmatched.length,
      unmatchedAmount: Math.round(unmatched.reduce((s, l) => s + l.amount, 0) * 100) / 100,
      matchedCount,
    };
  }
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / (24 * 60 * 60 * 1000));
}
