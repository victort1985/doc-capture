import { alphaField, numField, dateField, signedAmountField, assembleRecord } from './fixed-width-fields.util';
import type { DocumentTypeCode } from './document-type-codes';

export interface LedgerTransactionInput {
  recordNumberInFile: number;
  vatId: string;
  /** Internal transaction number — every line belonging to the same
   * journal entry shares this (spec clarification 7: "הכוונה לשדה
   * בתוכנת המקור אשר מקשר את כל השורות בפקודת היומן"). Vixor uses
   * the ledger entry's own id. */
  transactionNumber: number;
  lineNumberInTransaction: number;
  batchNumber?: number;
  transactionType?: string;
  reference?: string;
  referenceDocumentType?: DocumentTypeCode;
  reference2?: string;
  referenceDocumentType2?: DocumentTypeCode;
  details?: string;
  date: Date;
  valueDate: Date;
  accountKey: string; // must match a 110B record's own account key
  /** Single-entry bookkeeping only, per the spec's own note — Vixor
   * is always double-entry (see LedgerPostingService), so this stays
   * undefined in practice. */
  counterAccountKey?: string;
  /** 1 = debit/expense, 2 = credit/income (spec section 4.6's own
   * worked example) — NOT the same sign as the amount field itself;
   * amounts in this record are always POSITIVE, with this field
   * alone determining debit vs credit (spec clarification 8). */
  isCredit: boolean;
  foreignCurrencyCode?: string;
  amount: number; // always positive on the wire — see isCredit above
  foreignCurrencyAmount?: number;
  quantityField?: number;
  reconciliation1?: string;
  reconciliation2?: string;
  operatorUsername?: string;
}

/** 100B — a single debit or credit leg of a ledger transaction (spec
 * section 4.6). A balanced double-entry journal entry becomes
 * multiple 100B records sharing one transactionNumber — e.g. the
 * spec's own worked example (debit customer 117, credit VAT 17,
 * credit revenue 100) is 3 separate 100B records, lineNumberInTransaction
 * 1/2/3, all with the same transactionNumber. Total length 317. */
export function buildLedgerTransactionRecord(input: LedgerTransactionInput): string {
  const fields = [
    alphaField('100B', 4), // 1350
    numField(input.recordNumberInFile, 9), // 1351
    numField(parseInt(input.vatId, 10), 9), // 1352
    numField(input.transactionNumber, 10), // 1353
    numField(input.lineNumberInTransaction, 5), // 1354
    input.batchNumber != null ? numField(input.batchNumber, 8) : alphaField('', 8), // 1355
    alphaField(input.transactionType ?? '', 15), // 1356
    alphaField(input.reference ?? '', 20), // 1357
    input.referenceDocumentType != null ? numField(input.referenceDocumentType, 3) : alphaField('', 3), // 1358
    alphaField(input.reference2 ?? '', 20), // 1359
    input.referenceDocumentType2 != null ? numField(input.referenceDocumentType2, 3) : alphaField('', 3), // 1360
    alphaField(input.details ?? '', 50), // 1361
    dateField(input.date), // 1362
    dateField(input.valueDate), // 1363
    alphaField(input.accountKey, 15), // 1364
    alphaField(input.counterAccountKey ?? '', 15), // 1365
    numField(input.isCredit ? 2 : 1, 1), // 1366
    alphaField(input.foreignCurrencyCode ?? '', 3), // 1367
    signedAmountField(Math.abs(input.amount), 15, 2), // 1368 — always positive; sign of the transaction comes from field 1366, not this field
    input.foreignCurrencyAmount != null ? signedAmountField(input.foreignCurrencyAmount, 15, 2) : alphaField('', 15), // 1369
    input.quantityField != null ? signedAmountField(input.quantityField, 12, 3) : alphaField('', 12), // 1370
    alphaField(input.reconciliation1 ?? '', 10), // 1371
    alphaField(input.reconciliation2 ?? '', 10), // 1372
    alphaField('', 7), // 1374 — branch/division id, not applicable; 1373 is a cancelled zero-width field, skipped entirely
    dateField(input.date), // 1375 — entry date; Vixor doesn't distinguish a separate "entered on" timestamp from the transaction date itself
    alphaField(input.operatorUsername ?? '', 9), // 1376
    alphaField('', 25), // 1377 — future
  ];
  return assembleRecord(fields, 317);
}

export interface ChartOfAccountInput {
  recordNumberInFile: number;
  vatId: string;
  accountKey: string; // unique — referenced by 100B's own accountKey/counterAccountKey
  accountName: string;
  trialBalanceCode?: string;
  trialBalanceDescription?: string;
  street?: string;
  houseNumber?: string;
  city?: string;
  zip?: string;
  country?: string;
  countryCode?: string;
  centralAccount?: string;
  openingBalance: number; // signed: '+' = debit balance, '-' = credit balance (spec's own note on field 1414)
  totalDebit: number; // excludes the opening balance itself
  totalCredit: number; // excludes the opening balance itself
  /** Per Form 6111 — only required for taxpayers subject to that
   * reporting requirement; left blank otherwise. */
  form6111Code?: number;
  supplierOrClientVatId?: string;
  openingBalanceForeign?: number;
  openingBalanceForeignCurrencyCode?: string;
}

/** 110B — one row per account in the chart of accounts (spec section
 * 4.7). Every accountKey referenced by any 100B record in the same
 * export must have exactly one corresponding 110B record. Total
 * length 376. */
export function buildChartOfAccountRecord(input: ChartOfAccountInput): string {
  const fields = [
    alphaField('110B', 4), // 1400
    numField(input.recordNumberInFile, 9), // 1401
    numField(parseInt(input.vatId, 10), 9), // 1402
    alphaField(input.accountKey, 15), // 1403
    alphaField(input.accountName, 50), // 1404
    alphaField(input.trialBalanceCode ?? '', 15), // 1405
    alphaField(input.trialBalanceDescription ?? '', 30), // 1406
    alphaField(input.street ?? '', 50), // 1407
    alphaField(input.houseNumber ?? '', 10), // 1408
    alphaField(input.city ?? '', 30), // 1409
    alphaField(input.zip ?? '', 8), // 1410
    alphaField(input.country ?? '', 30), // 1411
    alphaField(input.countryCode ?? '', 2), // 1412
    alphaField(input.centralAccount ?? '', 15), // 1413
    signedAmountField(input.openingBalance, 15, 2), // 1414
    signedAmountField(Math.abs(input.totalDebit), 15, 2), // 1415 — always positive, per the spec's own field description
    signedAmountField(Math.abs(input.totalCredit), 15, 2), // 1416 — always positive, same reasoning
    input.form6111Code != null ? numField(input.form6111Code, 4) : alphaField('', 4), // 1417
    input.supplierOrClientVatId ? numField(parseInt(input.supplierOrClientVatId, 10), 9) : alphaField('', 9), // 1419 — 1418 is a cancelled zero-width field, skipped entirely
    alphaField('', 7), // 1421 — branch/division id, not applicable; 1420 is a cancelled zero-width field, skipped entirely
    input.openingBalanceForeign != null ? signedAmountField(input.openingBalanceForeign, 15, 2) : alphaField('', 15), // 1422
    alphaField(input.openingBalanceForeignCurrencyCode ?? '', 3), // 1423
    alphaField('', 16), // 1424 — future
  ];
  return assembleRecord(fields, 376);
}
