/** RFC4180-ish CSV parser — handles quoted fields, escaped quotes,
 * and both \r\n and \n line endings. Same approach already proven in
 * ExpensesService's own hand-rolled parser; pulled out here so the
 * data-migration module (and anything else that needs generic CSV
 * import) doesn't duplicate it a third time. */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') { inQuotes = false; }
        else { cur += ch; }
      } else if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else { cur += ch; }
    }
    fields.push(cur);
    return fields.map((f) => f.trim());
  };

  const lines = text.split(/\r\n|\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 1) return { headers: [], rows: [] };
  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return row;
  });
  return { headers, rows };
}

/** Quotes a field only when it actually needs it (contains a comma,
 * quote, or newline) — keeps typical exports readable rather than
 * quoting every single cell defensively. */
function csvField(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.map(csvField).join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => csvField(row[h])).join(','));
  }
  // \r\n endings + a UTF-8 BOM — the exact combination that makes
  // Hebrew/Russian text open correctly in Excel by default (bare LF
  // and no BOM is what causes the classic "garbled text" complaint
  // every one of the Hebrew accounting-software help pages found
  // during research warns about).
  return '\uFEFF' + lines.join('\r\n');
}
