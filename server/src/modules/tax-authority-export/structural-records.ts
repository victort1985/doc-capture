import { alphaField, numField, dateField, timeField, assembleRecord } from './fixed-width-fields.util';

/** This exact 8-char constant appears in every INI/opening/closing
 * record (fields 1005, 1104, 1154) per the spec. Extracted from a
 * right-to-left PDF table, so its literal character order couldn't
 * be double-checked against a second independent source — worth a
 * quick sanity check against the Tax Authority's own online
 * simulator before a real submission, same as everything else in
 * this module that hasn't been run through it yet. */
export const SYSTEM_CONSTANT = '&OF1.31&';

export interface BusinessInfo {
  vatId: string; // מספר עוסק מורשה — 9 digits
  businessName: string;
  street?: string;
  houseNumber?: string;
  city?: string;
  zip?: string;
  companyRegistrationNumber?: string; // מספר חברה ברשם החברות
  deductionsFileNumber?: string; // מספר תיק ניכויים
  hasBranches: boolean;
}

export interface ExportRange {
  /** Multi-year software only (Vixor always is — see note on
   * softwareType below) — the date range this export covers. */
  from: Date;
  to: Date;
}

/** softwareRegistrationNumber is blank/placeholder until the actual
 * Tax Authority registration is complete — every record that carries
 * it (field 1006) will need the real certificate number substituted
 * in once issued. */
export interface SoftwareInfo {
  registrationNumber: string; // 8 digits — blank/zeros pre-registration
  name: string;
  edition: string;
  vendorVatId: string;
  vendorName: string;
}

/** INI.TXT's one leading record (section 3.1) — business + process
 * metadata. Field-by-field total: 4+5+15+9+15+8+8+20+20+9+20+1+50+1+1
 * +9+9+10+50+50+10+30+8+4+8+8+8+4+1+1+20+0+3+0+1+46 = 466, matching
 * the spec's own declared length for this record type.
 */
export function buildIniHeaderRecord(
  business: BusinessInfo,
  software: SoftwareInfo,
  range: ExportRange,
  totalBkmvdataRecords: number,
  primaryId: string, // 15-digit random identifier, field 1004/1103/1153 — must be IDENTICAL across all three
  processStart: Date,
): string {
  const fields = [
    alphaField('A000', 4), // 1000 — CONFIRMED via the real Tax Authority simulator's own error message ("קובץ INI.TXT אינו מכיל רשומה מרכזת... קוד רשומה מרכזת A000") after an initial reading of the RTL-rendered PDF table extracted this as "000A" (characters reversed) — this is directly-tested ground truth, not a guess
    alphaField('', 5), // 1001 — future use
    numField(totalBkmvdataRecords, 15), // 1002
    numField(parseInt(business.vatId, 10), 9), // 1003
    numField(parseInt(primaryId, 10), 15), // 1004
    alphaField(SYSTEM_CONSTANT, 8), // 1005
    numField(parseInt(software.registrationNumber || '0', 10), 8), // 1006
    alphaField(software.name, 20), // 1007
    alphaField(software.edition, 20), // 1008
    numField(parseInt(software.vendorVatId, 10), 9), // 1009
    alphaField(software.vendorName, 20), // 1010
    numField(2, 1), // 1011 — software type: 1=single-year, 2=multi-year (Vixor is always multi-year: an ongoing ERP, not a per-tax-year tool)
    alphaField('', 50), // 1012 — storage path, filled in by the caller writing the actual files, not meaningful inside the record itself
    numField(2, 1), // 1013 — bookkeeping type: 2 = double-entry (see LedgerPostingService)
    numField(1, 1), // 1014 — balance requirement: 1 = transaction level (every journal entry individually balances — see LedgerPostingService)
    numField(business.companyRegistrationNumber ? parseInt(business.companyRegistrationNumber, 10) : 0, 9), // 1015
    numField(business.deductionsFileNumber ? parseInt(business.deductionsFileNumber, 10) : 0, 9), // 1016
    alphaField('', 10), // 1017 — future
    alphaField(business.businessName, 50), // 1018
    alphaField(business.street ?? '', 50), // 1019
    alphaField(business.houseNumber ?? '', 10), // 1020
    alphaField(business.city ?? '', 30), // 1021
    alphaField(business.zip ?? '', 8), // 1022
    numField(0, 4), // 1023 — tax year, only required for single-year software (Vixor is multi-year, so this stays 0/blank)
    dateField(range.from), // 1024
    dateField(range.to), // 1025
    dateField(processStart), // 1026
    timeField(processStart), // 1027
    numField(0, 1), // 1028 — language: 0 = Hebrew
    numField(1, 1), // 1029 — charset: 1 = ISO-8859-8
    alphaField('AdmZip', 20), // 1030 — compression tool name. CONFIRMED via the real simulator's own error ("שדה חובה, חייב להכיל ערך" — required field, must contain a value) that this can't be left blank as an earlier version of this module assumed
    alphaField('', 0), // 1031 — cancelled field, zero-width
    alphaField('ILS', 3), // 1032 — leading currency
    alphaField('', 0), // 1033 — cancelled field, zero-width
    numField(business.hasBranches ? 1 : 0, 1), // 1034
    alphaField('', 46), // 1035 — future
  ];
  return assembleRecord(fields, 466);
}

/** One of these per record-type actually present in BKMVDATA (spec
 * section 3.2) — total length 19: 4 (code) + 15 (count). */
export function buildIniSummaryRecord(recordTypeCode: string, count: number): string {
  const fields = [
    alphaField(recordTypeCode, 4), // 1050
    numField(count, 15), // 1051
  ];
  return assembleRecord(fields, 19);
}

/** BKMVDATA's own leading record (section 4.1) — length 95:
 * 4+9+9+15+8+50 = 95. */
export function buildOpeningRecord(recordNumberInFile: number, vatId: string, primaryId: string): string {
  const fields = [
    alphaField('A100', 4), // 1100
    numField(recordNumberInFile, 9), // 1101
    numField(parseInt(vatId, 10), 9), // 1102
    numField(parseInt(primaryId, 10), 15), // 1103
    alphaField(SYSTEM_CONSTANT, 8), // 1104
    alphaField('', 50), // 1105 — future
  ];
  return assembleRecord(fields, 95);
}

/** BKMVDATA's own closing record (section 4.2) — length 110:
 * 4+9+9+15+8+15+50 = 110. totalRecordsInFile MUST include the
 * opening and this closing record themselves in the count (spec:
 * "כל הרשומות כולל רשומת פתיחה וסגירה של הקובץ"). */
export function buildClosingRecord(
  recordNumberInFile: number,
  vatId: string,
  primaryId: string,
  totalRecordsInFile: number,
): string {
  const fields = [
    alphaField('Z900', 4), // 1150
    numField(recordNumberInFile, 9), // 1151
    numField(parseInt(vatId, 10), 9), // 1152
    numField(parseInt(primaryId, 10), 15), // 1153
    alphaField(SYSTEM_CONSTANT, 8), // 1154
    numField(totalRecordsInFile, 15), // 1155
    alphaField('', 50), // 1156 — future
  ];
  return assembleRecord(fields, 110);
}
