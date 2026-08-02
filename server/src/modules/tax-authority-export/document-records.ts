import { alphaField, numField, dateField, signedAmountField, unsignedRateField, assembleRecord } from './fixed-width-fields.util';
import type { DocumentTypeCode } from './document-type-codes';

export interface DocumentHeaderInput {
  recordNumberInFile: number;
  vatId: string;
  documentType: DocumentTypeCode;
  documentNumber: string;
  issueDate: Date;
  issueTime?: Date;
  /** Client for a sales-side document, supplier for a purchase-side
   * one — the spec doesn't distinguish the column, only the meaning
   * shifts with documentType (section 2.4.ד's own note). */
  partyName?: string;
  partyStreet?: string;
  partyHouseNumber?: string;
  partyCity?: string;
  partyZip?: string;
  partyCountry?: string;
  partyCountryCode?: string; // ISO 3166-1 alpha-2, per Appendix 3
  partyPhone?: string;
  partyVatId?: string;
  valueDate?: Date;
  amountBeforeDiscount: number;
  documentDiscount: number; // stored as a negative value on the wire — see field 1220's own note in the spec (הנחה = negative)
  amountAfterDiscountExclVat: number;
  vatAmount: number;
  totalAmountInclVat: number;
  withholdingTaxAmount?: number;
  /** מפתח הלקוח אצל המוכר / מפתח הספק אצל הקונה — required only for
   * sales/purchase document types (100-710 per the spec's own
   * conditional note on field 1225). */
  partyKey?: string;
  documentDate: Date; // the date printed ON the document, may differ from issueDate (spec clarification 12)
  cancelled?: boolean;
  operatorUsername?: string;
  /** Internal link field (1234) — ties this header to its 110D line
   * records without relying on document number alone (spec
   * clarification 11). Vixor uses the document's own numeric id. */
  linkId?: number;
}

/** 100C — document header (spec section 4.3). Total length 444,
 * verified field-by-field against the spec's own table (see the
 * inline field-number comments) and confirmed by actually assembling
 * a record and checking its length. */
export function buildDocumentHeaderRecord(input: DocumentHeaderInput): string {
  const fields = [
    alphaField('100C', 4), // 1200
    numField(input.recordNumberInFile, 9), // 1201
    numField(parseInt(input.vatId, 10), 9), // 1202
    numField(input.documentType, 3), // 1203
    alphaField(input.documentNumber, 20), // 1204
    dateField(input.issueDate), // 1205
    input.issueTime ? numField(input.issueTime.getHours() * 100 + input.issueTime.getMinutes(), 4) : alphaField('', 4), // 1206
    alphaField(input.partyName ?? '', 50), // 1207
    alphaField(input.partyStreet ?? '', 50), // 1208
    alphaField(input.partyHouseNumber ?? '', 10), // 1209
    alphaField(input.partyCity ?? '', 30), // 1210
    alphaField(input.partyZip ?? '', 8), // 1211
    alphaField(input.partyCountry ?? '', 30), // 1212
    alphaField(input.partyCountryCode ?? '', 2), // 1213
    alphaField(input.partyPhone ?? '', 15), // 1214
    input.partyVatId ? numField(parseInt(input.partyVatId, 10), 9) : alphaField('', 9), // 1215
    input.valueDate ? dateField(input.valueDate) : alphaField('', 8), // 1216
    alphaField('', 15), // 1217 — foreign-currency final amount, export invoices only; Vixor doesn't track a separate FX total per document today
    alphaField('', 3), // 1218 — FX currency code, same reason as 1217
    signedAmountField(input.amountBeforeDiscount, 15, 2), // 1219
    signedAmountField(input.documentDiscount, 15, 2), // 1220
    signedAmountField(input.amountAfterDiscountExclVat, 15, 2), // 1221
    signedAmountField(input.vatAmount, 15, 2), // 1222
    signedAmountField(input.totalAmountInclVat, 15, 2), // 1223
    signedAmountField(input.withholdingTaxAmount ?? 0, 12, 2), // 1224
    alphaField(input.partyKey ?? '', 15), // 1225
    alphaField('', 10), // 1226 — reconciliation field, no Vixor equivalent yet
    // 1227 is a cancelled, zero-width field — skipped entirely (not even an empty alphaField call, to avoid exactly the kind of accidental-duplicate-entry bug this comment itself caught during testing)
    alphaField(input.cancelled ? '1' : '', 1), // 1228
    // 1229 is a cancelled, zero-width field — skipped entirely, same as 1227 above
    dateField(input.documentDate), // 1230
    alphaField('', 7), // 1231 — branch/division id, Vixor doesn't model branches yet (field 1034 is always 0 to match)
    // 1232 is a cancelled, zero-width field — skipped entirely, same as 1227/1229 above
    alphaField(input.operatorUsername ?? '', 9), // 1233
    input.linkId != null ? numField(input.linkId, 7) : alphaField('', 7), // 1234
    alphaField('', 13), // 1235 — future
  ];
  return assembleRecord(fields, 444);
}

export interface DocumentLineInput {
  recordNumberInFile: number;
  vatId: string;
  documentType: DocumentTypeCode;
  documentNumber: string;
  lineNumber: number;
  /** Both required together when this line is based on another
   * document (spec clarification 6) — e.g. an invoice line that
   * closed a delivery-note line. */
  baseDocumentType?: DocumentTypeCode;
  baseDocumentNumber?: string;
  /** 1=service, 2=goods, 3=both. */
  transactionType?: 1 | 2 | 3;
  internalSku?: string;
  itemDescription: string;
  unitDescription: string; // a real unit name (e.g. "ליטר") when meaningful, otherwise the literal word "יחידה" per the spec's own instruction
  quantity: number;
  unitPriceExclVat?: number;
  lineDiscount?: number; // negative on the wire, same convention as the header's own discount field
  lineTotal?: number;
  vatRatePercent: number; // e.g. 18 for 18%
  documentDate: Date;
  /** Ties this line back to its 100C header (spec clarification 11) —
   * must match that header's own linkId. */
  headerLinkId?: number;
}

/** 110D — document line details (spec section 4.4). Total length
 * 339, verified the same way as the header record above. */
export function buildDocumentLineRecord(input: DocumentLineInput): string {
  const fields = [
    alphaField('110D', 4), // 1250
    numField(input.recordNumberInFile, 9), // 1251
    numField(parseInt(input.vatId, 10), 9), // 1252
    numField(input.documentType, 3), // 1253
    alphaField(input.documentNumber, 20), // 1254
    numField(input.lineNumber, 4), // 1255
    input.baseDocumentType != null ? numField(input.baseDocumentType, 3) : alphaField('', 3), // 1256
    alphaField(input.baseDocumentNumber ?? '', 20), // 1257
    input.transactionType != null ? numField(input.transactionType, 1) : alphaField('', 1), // 1258
    alphaField(input.internalSku ?? '', 20), // 1259
    alphaField(input.itemDescription, 30), // 1260
    alphaField('', 50), // 1261 — manufacturer name, only required for the specific regulated-goods category in Appendix ג of Directive 36; not applicable to Vixor's own customers today
    alphaField('', 30), // 1262 — manufacturer serial number, same scope as 1261
    alphaField(input.unitDescription, 20), // 1263
    signedAmountField(input.quantity, 17, 3), // 1264
    signedAmountField(input.unitPriceExclVat ?? 0, 15, 2), // 1265
    signedAmountField(input.lineDiscount ?? 0, 15, 2), // 1266
    signedAmountField(input.lineTotal ?? 0, 15, 2), // 1267
    unsignedRateField(input.vatRatePercent, 4, 2), // 1268
    alphaField('', 7), // 1270 — branch/division id, same as the header's own 1231; 1269 is a cancelled zero-width field, skipped entirely
    dateField(input.documentDate), // 1272 — 1271 is a cancelled zero-width field, skipped entirely
    input.headerLinkId != null ? numField(input.headerLinkId, 7) : alphaField('', 7), // 1273
    alphaField('', 7), // 1274 — base document's own branch id, same non-applicability as 1231/1270
    alphaField('', 21), // 1275 — future
  ];
  return assembleRecord(fields, 339);
}
