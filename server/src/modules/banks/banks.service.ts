import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { BankBranch } from './entities/bank-branch.entity';
import { ISRAELI_BANKS, type BankReference } from './israeli-banks.data';
import { parseCsv } from '../../common/utils/csv.util';

// Header names commonly used by the downloadable spreadsheets this
// data tends to come from (Hebrew accounting-reference sites, Bank
// of Israel's own exports) — matched case-insensitively so "בנק",
// "קוד בנק", "bank code" etc. all hit the same target field.
const BRANCH_FIELD_HINTS: Record<string, string[]> = {
  bankCode: ['קוד בנק', 'בנק', 'bank code', 'bank'],
  branchNumber: ['סניף', 'מספר סניף', 'branch', 'branch number'],
  branchName: ['שם סניף', 'branch name'],
  city: ['עיר', 'city'],
  address: ['כתובת', 'address'],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/["'.]/g, '');
}

@Injectable()
export class BanksService {
  constructor(@InjectRepository(BankBranch) private readonly branchesRepo: Repository<BankBranch>) {}

  listBanks(): BankReference[] {
    return ISRAELI_BANKS;
  }

  /** Simple substring search across both the bank's Hebrew and
   * English names and its code — used by the frontend picker's
   * autocomplete. Small enough list (~20 entries) that this runs
   * in-memory rather than needing a DB round-trip. */
  searchBanks(query: string): BankReference[] {
    const q = query.trim().toLowerCase();
    if (!q) return ISRAELI_BANKS;
    return ISRAELI_BANKS.filter(
      (b) => b.code.includes(q) || b.name.toLowerCase().includes(q) || b.nameEn?.toLowerCase().includes(q),
    );
  }

  async searchBranches(bankCode: string, query: string): Promise<BankBranch[]> {
    const qb = this.branchesRepo.createQueryBuilder('b').where('b.bankCode = :bankCode', { bankCode });
    const q = query.trim();
    if (q) {
      qb.andWhere('(b.branchNumber ILIKE :q OR b.branchName ILIKE :q OR b.city ILIKE :q)', { q: `%${q}%` });
    }
    return qb.orderBy('b.branchNumber', 'ASC').limit(50).getMany();
  }

  async branchCount(): Promise<number> {
    return this.branchesRepo.count();
  }

  /** Imports (or re-imports) the branch registry from a CSV export —
   * see BankBranch's own doc comment for why this is CSV-import-
   * driven rather than hand-transcribed data. Upserts on
   * (bankCode, branchNumber) so re-running an import with an updated
   * file is safe and idempotent, matching the same "keep going,
   * report failures individually" principle as every other CSV
   * import in this app (ExpensesService, DataMigrationService). */
  /** Accepts either CSV or XLSX — the actual downloadable branch-
   * registry sources found during research are typically .xlsx, and
   * requiring a manual "save as CSV" step first would be needless
   * friction. Same ExcelJS-based parsing already established in
   * DataMigrationService.analyzeImportFile, not a second
   * implementation of the same logic. */
  async importFile(buffer: Buffer, originalName: string): Promise<{ imported: number; failed: { row: number; error: string }[] }> {
    let headers: string[];
    let rows: Record<string, string>[];

    if (/\.xlsx?$/i.test(originalName)) {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buffer as any);
      const sheet = wb.worksheets[0];
      if (!sheet) throw new BadRequestException('The Excel file has no sheets');
      const allRows: string[][] = [];
      sheet.eachRow((row) => {
        const values = (row.values as any[]).slice(1).map((v) => (v == null ? '' : String(v).trim()));
        allRows.push(values);
      });
      if (allRows.length < 1) throw new BadRequestException('The Excel file is empty');
      headers = allRows[0].map((h) => h.trim());
      rows = allRows.slice(1).map((values) => {
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
        return row;
      });
    } else {
      const parsed = parseCsv(buffer.toString('utf-8'));
      headers = parsed.headers;
      rows = parsed.rows;
    }

    const mapping: Record<string, string> = {};
    for (const [field, hints] of Object.entries(BRANCH_FIELD_HINTS)) {
      const match = headers.find((h) => hints.some((hint) => normalizeHeader(h).includes(normalizeHeader(hint))));
      if (match) mapping[field] = match;
    }

    let imported = 0;
    const failed: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const get = (field: string) => {
        const col = mapping[field];
        return col ? (row[col] ?? '').trim() : '';
      };
      try {
        const bankCodeRaw = get('bankCode');
        const branchNumber = get('branchNumber');
        if (!bankCodeRaw) throw new Error('missing bank code');
        if (!branchNumber) throw new Error('missing branch number');

        // The source spreadsheet's "bank" column is sometimes a
        // numeric code and sometimes the bank's full name (e.g. real
        // branch-registry exports tend to show "בנק יהב לעובדי
        // המדינה בעמ" rather than a bare "04") — resolve by name
        // against ISRAELI_BANKS when it isn't already numeric, rather
        // than assuming every source file uses the same convention.
        const bankCode = /^\d+$/.test(bankCodeRaw)
          ? bankCodeRaw.padStart(2, '0')
          : ISRAELI_BANKS.find((b) => bankCodeRaw.includes(b.name) || b.name.includes(bankCodeRaw))?.code;
        if (!bankCode) throw new Error(`could not resolve bank "${bankCodeRaw}" to a known bank code`);

        const existing = await this.branchesRepo.findOne({ where: { bankCode, branchNumber } });
        const values = {
          bankCode,
          branchNumber,
          branchName: get('branchName') || undefined,
          city: get('city') || undefined,
          address: get('address') || undefined,
        };
        if (existing) {
          await this.branchesRepo.update(existing.id, values);
        } else {
          await this.branchesRepo.save(this.branchesRepo.create(values));
        }
        imported++;
      } catch (e) {
        failed.push({ row: i + 2, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return { imported, failed };
  }
}
