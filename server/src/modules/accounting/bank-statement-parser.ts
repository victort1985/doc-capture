
export interface ParsedBankLine {
  date: string; // yyyy-mm-dd
  description: string;
  amount: number; // signed — positive in, negative out
  reference?: string;
}

/** Column-header aliases this recognizes, case-insensitively, in
 * either Hebrew or English — every Israeli bank names these columns
 * slightly differently in their own CSV/XLSX export, and nobody
 * should have to rename spreadsheet headers before uploading a real
 * bank statement. Add more aliases here as real exports from other
 * banks turn up rather than requiring a fixed template. */
const DATE_ALIASES = ['date', 'תאריך', 'תאריך ערך', 'transaction date'];
const DESCRIPTION_ALIASES = ['description', 'details', 'תיאור', 'פרטים', 'תאור', 'memo', 'narrative'];
const AMOUNT_ALIASES = ['amount', 'סכום', 'sum'];
const DEBIT_ALIASES = ['debit', 'חובה', 'out', 'withdrawal', 'belastung'];
const CREDIT_ALIASES = ['credit', 'זכות', 'in', 'deposit'];
const REFERENCE_ALIASES = ['reference', 'ref', 'אסמכתא', 'מספר אסמכתא', 'check number', 'צ\'ק'];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase();
}

function findColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  // dd/mm/yyyy or dd-mm-yyyy (most common in Israeli bank exports)
  const dmy = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (dmy) {
    const [, d, m] = dmy;
    let y = dmy[3];
    if (y.length === 2) y = `20${y}`;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  // Already yyyy-mm-dd
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,₪$\s]/g, '').trim();
  if (!cleaned) return null;
  // Parenthesized negatives, e.g. "(150.00)", another common bank convention
  const parenNegative = cleaned.match(/^\((.+)\)$/);
  const n = Number(parenNegative ? `-${parenNegative[1]}` : cleaned);
  return Number.isFinite(n) ? n : null;
}

function rowsToLines(headers: string[], rows: string[][]): ParsedBankLine[] {
  const dateCol = findColumn(headers, DATE_ALIASES);
  const descCol = findColumn(headers, DESCRIPTION_ALIASES);
  const amountCol = findColumn(headers, AMOUNT_ALIASES);
  const debitCol = findColumn(headers, DEBIT_ALIASES);
  const creditCol = findColumn(headers, CREDIT_ALIASES);
  const refCol = findColumn(headers, REFERENCE_ALIASES);

  if (dateCol === -1) throw new Error('Could not find a date column in the statement — expected a header like "Date" or "תאריך".');
  if (amountCol === -1 && debitCol === -1 && creditCol === -1) {
    throw new Error('Could not find an amount column — expected "Amount"/"סכום", or separate "Debit"/"Credit" columns.');
  }

  const lines: ParsedBankLine[] = [];
  for (const row of rows) {
    const rawDate = row[dateCol];
    if (!rawDate?.trim()) continue; // blank/trailing row
    const date = parseDate(rawDate);
    if (!date) continue;

    let amount: number | null = null;
    if (amountCol !== -1) {
      amount = parseAmount(row[amountCol] ?? '');
    } else {
      const debit = debitCol !== -1 ? parseAmount(row[debitCol] ?? '') : null;
      const credit = creditCol !== -1 ? parseAmount(row[creditCol] ?? '') : null;
      if (credit) amount = Math.abs(credit);
      else if (debit) amount = -Math.abs(debit);
    }
    if (amount == null || amount === 0) continue;

    lines.push({
      date,
      description: (descCol !== -1 ? row[descCol] : '')?.trim() || '(no description)',
      amount,
      reference: refCol !== -1 ? row[refCol]?.trim() || undefined : undefined,
    });
  }
  return lines;
}

function parseCsvText(text: string): { headers: string[]; rows: string[][] } {
  // Simple but real CSV parsing (handles quoted fields with embedded
  // commas) — a full RFC 4180 parser would be overkill for bank
  // exports, which are consistently simple, but naive split(',')
  // breaks the moment a description field contains a comma.
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else cur += ch;
      } else if (ch === '"') { inQuotes = true; }
      else if (ch === ',' || ch === ';') { fields.push(cur); cur = ''; }
      else cur += ch;
    }
    fields.push(cur);
    return fields;
  };
  const [headerLine, ...rest] = lines;
  return { headers: parseLine(headerLine), rows: rest.map(parseLine) };
}

async function parseXlsxBuffer(buffer: Buffer): Promise<{ headers: string[]; rows: string[][] }> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('The uploaded file has no sheets.');
  const allRows: string[][] = [];
  sheet.eachRow((row) => {
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell) => {
      const v = cell.value;
      cells.push(v == null ? '' : typeof v === 'object' && 'text' in (v as any) ? (v as any).text : String(v));
    });
    allRows.push(cells);
  });
  const [headers, ...rows] = allRows;
  return { headers: headers ?? [], rows };
}

export async function parseBankStatement(buffer: Buffer, fileName: string): Promise<ParsedBankLine[]> {
  const isXlsx = /\.xlsx?$/i.test(fileName);
  const { headers, rows } = isXlsx ? await parseXlsxBuffer(buffer) : parseCsvText(buffer.toString('utf-8'));
  const lines = rowsToLines(headers, rows);
  if (lines.length === 0) {
    throw new Error('No usable transaction rows found in the file — check that it has date and amount columns with actual data.');
  }
  return lines;
}
