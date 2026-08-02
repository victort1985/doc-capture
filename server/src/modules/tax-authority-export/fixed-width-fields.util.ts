/**
 * Field-formatting primitives for Israel's Tax Authority "Uniform
 * Structure" export (הוראות להפקת קבצים במבנה אחיד, גרסה 1.31,
 * horaot_131.pdf) — the file format software producers must be able
 * to generate as part of registering with the Tax Authority's
 * software registry (מרשם תוכנות לניהול מערכת חשבונות).
 *
 * Every record in this format is a FIXED-WIDTH line (no delimiters):
 * each field occupies an exact column range, alphanumeric fields are
 * left-aligned and space-padded, numeric fields are right-aligned
 * and zero-padded, and every line ends with CR+LF (not counted in
 * the declared record length). Getting a single field's width wrong
 * shifts every subsequent field in the line, so these primitives are
 * deliberately strict (throw rather than silently truncate/overflow)
 * and are tested against the spec document's own worked examples
 * (section 2.3.ו and section 2.4.יא) rather than only inspected by
 * eye.
 */

/** Left-aligned, space-padded on the right. Throws if the value is
 * too long to fit (silently truncating user/business data would be
 * far worse than a loud failure here). */
export function alphaField(value: string | null | undefined, length: number): string {
  const str = (value ?? '').toString();
  if (str.length > length) {
    throw new Error(`Value "${str}" (${str.length} chars) exceeds the field's fixed width of ${length}`);
  }
  return str.padEnd(length, ' ');
}

/** Right-aligned, zero-padded on the left. Digits only. */
export function numField(value: number | null | undefined, length: number): string {
  const n = Math.trunc(value ?? 0);
  if (n < 0) throw new Error(`numField does not accept negative values (got ${n}) — use signedAmountField for signed quantities`);
  const str = String(n);
  if (str.length > length) {
    throw new Error(`Value ${n} (${str.length} digits) exceeds the field's fixed width of ${length}`);
  }
  return str.padStart(length, '0');
}

/** Date field: YYYYMMDD, always 8 numeric digits (spec section 2.4.ב). */
export function dateField(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/** Time field: HHMM, always 4 numeric digits, 24h (spec section 2.4.ג). */
export function timeField(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${h}${min}`;
}

/**
 * Signed monetary/quantity amount field — the format used throughout
 * the spec for every money and quantity column (e.g. fields 1217,
 * 1219-1223, 1264, 1368-1369, etc). Structure, per section 2.3.ו's
 * own worked example:
 *   1 leading sign character ('+' or '-'), then the integer part
 *   zero-padded to fill the remaining width, then the decimal part
 *   with NO literal decimal point — the point's position is implied
 *   by decimalPlaces and known from the field's own spec entry.
 *
 * Verified directly against the spec's own examples (see this file's
 * .spec.ts): -12345.65 with 2 decimal places -> "-1234565";
 * 1245.65 -> "+0124565"; 1245 (no fractional part) -> "+0124500".
 */
export function signedAmountField(value: number, totalLength: number, decimalPlaces: number): string {
  const sign = value < 0 ? '-' : '+';
  const abs = Math.abs(value);
  // Round to the target precision before splitting, so e.g. floating-
  // point noise (1245.6999999999998) doesn't produce a wrong digit.
  const scaled = Math.round(abs * 10 ** decimalPlaces);
  const digits = String(scaled);
  const integerAndDecimalWidth = totalLength - 1; // minus the sign char
  if (digits.length > integerAndDecimalWidth) {
    throw new Error(
      `Amount ${value} needs ${digits.length} digits at ${decimalPlaces} decimal places, ` +
      `which doesn't fit in a ${totalLength}-char signed field (${integerAndDecimalWidth} digits available)`,
    );
  }
  return sign + digits.padStart(integerAndDecimalWidth, '0');
}

/** Unsigned percentage/rate field (e.g. field 1268, VAT rate — spec's
 * own example: 15.50% is stored as the 4-digit string "1550", no
 * sign, no literal decimal point). */
export function unsignedRateField(value: number, totalLength: number, decimalPlaces: number): string {
  const scaled = Math.round(value * 10 ** decimalPlaces);
  const digits = String(scaled);
  if (digits.length > totalLength) {
    throw new Error(`Rate ${value} needs ${digits.length} digits, which doesn't fit in a ${totalLength}-char field`);
  }
  return digits.padStart(totalLength, '0');
}

/** Every record line ends with these two characters (spec section
 * 2.4.ט(2)) — CR then LF, NOT counted in the record's declared
 * length. */
export const RECORD_TERMINATOR = '\r\n';

/** Joins field values already produced by the helpers above into one
 * record line, verifying the total length matches what the spec
 * declares for that record type (a mismatch means a field was built
 * with the wrong width somewhere upstream — this is the last line of
 * defense against a silent column-shift bug that would otherwise
 * only surface as a rejected file from the government's own
 * validator, days or weeks later). */
export function assembleRecord(fields: string[], expectedLength: number): string {
  const line = fields.join('');
  if (line.length !== expectedLength) {
    throw new Error(`Assembled record is ${line.length} chars, expected exactly ${expectedLength}`);
  }
  return line + RECORD_TERMINATOR;
}
