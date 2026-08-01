import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import * as ExcelJS from 'exceljs';
import { parseCsv, toCsv } from '../../common/utils/csv.util';
import { MigrationJobsService } from './migration-jobs.service';
import { PhoneBookService } from '../phonebook/phonebook.service';
import { WarehouseService } from '../warehouse/warehouse.service';
import { RunImportDto } from './dto/run-import.dto';

export interface AnalyzeResult {
  fileToken: string;
  detectedFormat: 'csv' | 'xlsx' | 'movein-short' | 'movein-detailed' | 'unknown';
  headers: string[];
  previewRows: Record<string, string>[];
  rowCount: number;
  suggestedMapping: Record<string, string>;
  /** Only set for the recognized Chashbashevet native journal-entry
   * format — this format has no meaningful "contact" columns at all
   * (see MOVEIN.PDF: it's debit/credit account codes and amounts,
   * not names/phones/emails), so there's nothing useful to map it to
   * for a contacts import. Surfaced back to the wizard so it can
   * explain this plainly and offer the CSV/Excel account-index export
   * instead, rather than presenting an empty, confusing mapping step.
   */
  moveinNote?: string;
}

// Target contact fields a column can be mapped to, with the header
// names Chashbashevet's account-index (CSV/Excel) export commonly
// uses — matched case-insensitively, accents/quotes stripped, so
// "שם פרטי" and "שם  פרטי" both hit. Order matters: first match wins.
const CONTACT_FIELD_HINTS: Record<string, string[]> = {
  clientIdentifier: ['מפתח', 'קוד לקוח', 'קוד', 'client id', 'code'],
  firstName: ['שם פרטי', 'שם', 'name', 'first name'],
  lastName: ['שם משפחה', 'last name'],
  phone: ['טלפון', 'נייד', 'phone', 'mobile'],
  email: ['אימייל', 'מייל', 'דוא"ל', 'email'],
  taxId: ['ח.פ', 'עוסק מורשה', 'ע.מ', 'tax id', 'vat'],
  notes: ['הערות', 'notes', 'remarks'],
};

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/["'.]/g, '');
}

@Injectable()
export class DataMigrationService {
  private readonly logger = new Logger(DataMigrationService.name);
  private readonly fileCache = new Map<string, { rows: Record<string, string>[]; headers: string[]; createdAt: number }>();
  private readonly FILE_TTL_MS = 30 * 60 * 1000;

  constructor(
    private readonly jobs: MigrationJobsService,
    private readonly phoneBookService: PhoneBookService,
    private readonly warehouseService: WarehouseService,
  ) {}

  async analyzeImportFile(buffer: Buffer, originalName: string): Promise<AnalyzeResult> {
    this.sweepFiles();

    const text = buffer.toString('utf8');
    const firstLines = text.split(/\r\n|\n/).filter((l) => l.length > 0).slice(0, 5);
    // The official spec's 90/180 record length INCLUDES the trailing
    // LF+CR terminator (2 chars) — after splitting the text on that
    // same terminator, each line's remaining .length is 88/178, not
    // 90/180. Caught this exact off-by-2 via a standalone test with a
    // hand-built record before trusting it, not just by inspection.
    const isFixedWidth = (contentLen: number) => firstLines.length > 1 && firstLines.slice(1).every((l) => l.length === contentLen);
    if (isFixedWidth(88) || isFixedWidth(178)) {
      const fileToken = randomUUID();
      return {
        fileToken,
        detectedFormat: isFixedWidth(88) ? 'movein-short' : 'movein-detailed',
        headers: [],
        previewRows: [],
        rowCount: firstLines.length - 1,
        suggestedMapping: {},
        moveinNote:
          'זהו קובץ ממשק תנועות יומן (MOVEIN) של חשבשבת — פורמט חשבונאי של קודי חשבונות וסכומים, ' +
          'ואינו מכיל שמות, טלפונים או פרטי קשר. כדי לייבא רשימת לקוחות/ספקים, יש לייצא מחשבשבת ' +
          'את "אינדקס כרטיסים" כקובץ Excel או CSV במקום זאת.',
      };
    }

    let headers: string[];
    let rows: Record<string, string>[];
    let detectedFormat: AnalyzeResult['detectedFormat'];

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
      detectedFormat = 'xlsx';
    } else {
      const parsed = parseCsv(text);
      headers = parsed.headers;
      rows = parsed.rows;
      detectedFormat = 'csv';
    }

    if (headers.length === 0) {
      throw new BadRequestException('Could not find any column headers in this file');
    }

    const suggestedMapping: Record<string, string> = {};
    for (const [field, hints] of Object.entries(CONTACT_FIELD_HINTS)) {
      const match = headers.find((h) => hints.some((hint) => normalizeHeader(h).includes(normalizeHeader(hint))));
      if (match) suggestedMapping[field] = match;
    }

    const fileToken = randomUUID();
    this.fileCache.set(fileToken, { rows, headers, createdAt: Date.now() });

    return {
      fileToken,
      detectedFormat,
      headers,
      previewRows: rows.slice(0, 5),
      rowCount: rows.length,
      suggestedMapping,
    };
  }

  startContactsImport(dto: RunImportDto, userId: number, organizationId: number | null): string {
    const cached = dto.fileToken ? this.fileCache.get(dto.fileToken) : undefined;
    if (!cached) throw new BadRequestException('This file has expired or was never analyzed — please upload it again.');

    const job = this.jobs.create();
    this.jobs.setTotal(job.id, cached.rows.length);
    this.jobs.appendLog(job.id, `Starting import of ${cached.rows.length} rows as ${dto.category}…`);

    this.runContactsImportJob(job.id, cached.rows, dto, userId, organizationId).catch((err) => {
      this.logger.error(`Contacts import job ${job.id} crashed: ${err?.message}`);
      this.jobs.fail(job.id, err?.message ?? 'Unknown error');
    });

    return job.id;
  }

  private async runContactsImportJob(
    jobId: string,
    rows: Record<string, string>[],
    dto: RunImportDto,
    userId: number,
    organizationId: number | null,
  ): Promise<void> {
    let imported = 0;
    const failed: { row: number; error: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const get = (field: string) => {
        const col = dto.mapping[field];
        return col ? (row[col] ?? '').trim() : '';
      };

      try {
        const firstName = get('firstName');
        const phone = get('phone');
        if (!firstName) throw new Error('missing name');
        if (!phone) throw new Error('missing phone number');

        await this.phoneBookService.create(userId, organizationId, {
          category: dto.category,
          firstName,
          lastName: get('lastName') || '—',
          phone,
          email: get('email') || undefined,
          taxId: get('taxId') || undefined,
          notes: get('notes') || undefined,
        } as any);

        imported++;
        this.jobs.appendLog(jobId, `✓ Row ${i + 2}: ${firstName} ${get('lastName')}`.trim());
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        failed.push({ row: i + 2, error: message });
        this.jobs.appendLog(jobId, `✗ Row ${i + 2}: ${message}`);
      }
      this.jobs.incrementProcessed(jobId);
    }

    this.jobs.appendLog(jobId, `Done — ${imported} imported, ${failed.length} failed.`);
    this.jobs.complete(jobId, { imported, failed });
  }

  async startExport(entity: 'contacts' | 'warehouse', format: 'csv' | 'xlsx' | 'json', organizationId: number | null): Promise<string> {
    const job = this.jobs.create();
    this.runExportJob(job.id, entity, format, organizationId).catch((err) => {
      this.logger.error(`Export job ${job.id} crashed: ${err?.message}`);
      this.jobs.fail(job.id, err?.message ?? 'Unknown error');
    });
    return job.id;
  }

  private async runExportJob(
    jobId: string,
    entity: 'contacts' | 'warehouse',
    format: 'csv' | 'xlsx' | 'json',
    organizationId: number | null,
  ): Promise<void> {
    this.jobs.appendLog(jobId, `Fetching ${entity}…`);

    let headers: string[];
    let rows: Record<string, unknown>[];

    if (entity === 'contacts') {
      const contacts = await this.phoneBookService.findAll({ tenantId: organizationId });
      headers = ['clientIdentifier', 'category', 'firstName', 'lastName', 'phone', 'email', 'taxId', 'notes'];
      rows = contacts.map((c) => ({
        clientIdentifier: c.clientIdentifier ?? '',
        category: c.category,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.phone,
        email: c.email ?? '',
        taxId: c.taxId ?? '',
        notes: c.notes ?? '',
      }));
    } else {
      const items = await this.warehouseService.findItems(organizationId);
      headers = ['name', 'barcode', 'quantity', 'price'];
      rows = items.map((it) => ({ name: it.name, barcode: it.barcode, quantity: it.quantity, price: it.price ?? '' }));
    }

    this.jobs.setTotal(jobId, rows.length);
    this.jobs.appendLog(jobId, `Got ${rows.length} rows — building ${format.toUpperCase()} file…`);

    let buffer: Buffer;
    let mimeType: string;
    const fileName = `${entity}-export-${new Date().toISOString().slice(0, 10)}.${format}`;

    if (format === 'json') {
      buffer = Buffer.from(JSON.stringify(rows, null, 2), 'utf8');
      mimeType = 'application/json';
    } else if (format === 'csv') {
      buffer = Buffer.from(toCsv(headers, rows), 'utf8');
      mimeType = 'text/csv';
    } else {
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet(entity);
      sheet.addRow(headers);
      for (const row of rows) sheet.addRow(headers.map((h) => row[h]));
      buffer = Buffer.from(await wb.xlsx.writeBuffer());
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    this.jobs.attachFile(jobId, buffer, fileName, mimeType);
    for (let i = 0; i < rows.length; i++) this.jobs.incrementProcessed(jobId);
    this.jobs.appendLog(jobId, `Done — ${fileName} ready to download.`);
    this.jobs.complete(jobId, { fileName, rowCount: rows.length });
  }

  private sweepFiles(): void {
    const cutoff = Date.now() - this.FILE_TTL_MS;
    for (const [token, entry] of this.fileCache) {
      if (entry.createdAt < cutoff) this.fileCache.delete(token);
    }
  }
}
