import { DOCUMENT_TYPE_CODES } from './document-type-codes';
import { buildDocumentHeaderRecord, buildDocumentLineRecord } from './document-records';
import { buildReceiptLineRecord, mapVixorPaymentMethod } from './receipt-records';
import { buildLedgerTransactionRecord, buildChartOfAccountRecord } from './ledger-records';
import { buildInventoryItemRecord } from './inventory-records';
import type { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceStatus } from '../invoices/entities/invoice.entity';
import type { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { DeliveryNoteStatus } from '../delivery-notes/delivery-note.entity';
import type { CreditNote } from '../credit-notes/entities/credit-note.entity';
import type { DebitNote } from '../debit-notes/entities/debit-note.entity';
import type { Payment } from '../payments/entities/payment.entity';
import type { SupplierInvoice } from '../expenses/entities/supplier-invoice.entity';
import type { Expense } from '../expenses/entities/expense.entity';
import type { ReturnNote } from '../returns/entities/return-note.entity';
import type { LedgerEntry } from '../accounting/entities/ledger-entry.entity';
import type { Account } from '../accounting/entities/account.entity';
import type { WarehouseItem } from '../warehouse/entities/warehouse-item.entity';

/** None of the document mappers below set field 1225 (מפתח לקוח/ספק,
 * "the customer/supplier's OWN internal key in the seller's/buyer's
 * system") — an earlier version of this file populated it with the
 * client's full NAME, which is wrong on two counts: partyKey is
 * meant to be a short internal code, not a name (partyName, a
 * separate 50-char field, already carries the name correctly), and
 * a real client/company name can easily exceed partyKey's 15-char
 * width — found via an actual end-to-end export against realistic
 * test data (a company name with a comma and quoted branch name,
 * 27 chars), which crashed with a hard field-overflow error rather
 * than silently truncating (alphaField is deliberately strict — see
 * its own doc comment). None of Vixor's document entities have a
 * distinct client-ID field today, so this stays honestly blank
 * rather than reusing the wrong data a second time.
 */

/** Quotes (הצעת מחיר) are deliberately never mapped anywhere in this
 * file — they're a proposal, not a completed transaction, and
 * correctly have no code at all in the spec's own Appendix 1
 * document-type table. Including them would misrepresent the audit
 * trail as containing more actual business activity than really
 * happened. */

/** Invoice.vatCategory doesn't carry an explicit rate — deriving one
 * from the invoice's own stored numbers (rather than hardcoding
 * "18%", which drifts out of date exactly the way
 * TaxAuthoritySettings.thresholdAmount's own doc comment warns
 * about) keeps this correct automatically as Israel's VAT rate
 * changes over time, and naturally handles zero/exempt as 0% without
 * a separate branch. */
function deriveVatRatePercent(subtotal: number, vatAmount: number): number {
  if (subtotal <= 0) return 0;
  return Math.round((vatAmount / subtotal) * 100 * 100) / 100; // 2 decimal places
}

/** Field 1225 (מפתח לקוח/ספק) — confirmed via the real Tax Authority
 * simulator to be REQUIRED for sales/purchase document types, not
 * optional as an earlier version of this module assumed after
 * finding that the client's full NAME had been wrongly stuffed into
 * this 15-char field (a real bug, fixed then by leaving it blank —
 * which fixed the overflow but turned out to trade one bug for
 * another, since the field can't be empty either). None of Vixor's
 * document entities have a dedicated short client-ID field today, so
 * this picks the best available short, stable identifier instead of
 * reusing the full name a second time:
 *   1. clientTaxId, when the document has one (Invoice only today) —
 *      a business's own tax id is exactly the kind of stable
 *      "customer key" this field is meant to hold, and always fits
 *      (max 9 digits).
 *   2. The client name, safely truncated to 15 chars this time
 *      (never thrown on overflow, unlike the field this was
 *      originally copying from).
 *   3. A synthetic fallback ("REC-{id}") if even the name is empty —
 *      guarantees the field is never blank, since that's now a
 *      confirmed validation failure too. */
function resolvePartyKey(clientName: string | undefined, entityId: number, clientTaxId?: string): string {
  if (clientTaxId && clientTaxId.trim()) return clientTaxId.trim().slice(0, 15);
  const trimmedName = clientName?.trim();
  if (trimmedName) return trimmedName.slice(0, 15);
  return `REC-${entityId}`.slice(0, 15);
}

/** Field 1267 (lineTotal) must stay internally consistent with what
 * field 1265 (unitPriceExclVat) actually WRITES to the wire — that
 * field is itself rounded to 2 decimal places (see
 * signedAmountField's own 2dp call in document-records.ts). If
 * lineTotal were computed from the full-precision unitPrice instead
 * (e.g. quantity × 33.333333 rather than quantity × 33.33), a
 * validator that independently recomputes "rounded unit price ×
 * quantity" and compares it against the field this app actually sent
 * would see a real discrepancy for any fractional-cent price — the
 * likely explanation for the real Tax Authority simulator's own
 * "קיימת סטייה משמעותית בין ערך השדה לערך מחושב" (significant
 * deviation between the field's value and the computed value) error
 * on this exact field. Rounding the price FIRST, then multiplying,
 * keeps both fields describing the same number. */
function roundedLineTotal(quantity: number, unitPrice: number): number {
  const roundedPrice = Math.round(unitPrice * 100) / 100;
  return Math.round(quantity * roundedPrice * 100) / 100;
}

export interface InvoiceRecords {
  header: string;
  lines: string[];
}

/** Maps one Invoice to its 100C header + one 110D per line item.
 * recordNumberInFile/linkId are assigned by the caller (the overall
 * file-assembly step, which tracks a running record-number counter
 * across every record in the whole export — see
 * open-format-file.service.ts). */
export function mapInvoiceToRecords(
  invoice: Invoice,
  vatId: string,
  headerRecordNumber: number,
  lineRecordNumberStart: number,
): InvoiceRecords {
  const subtotal = invoice.items.reduce((sum, it) => sum + roundedLineTotal(it.quantity, it.unitPrice), 0);
  const vatAmount = Math.max(0, invoice.total - subtotal);
  const linkId = invoice.id;
  const issueDate = invoice.createdAt;
  const documentDate = invoice.date ? new Date(invoice.date) : invoice.createdAt;

  const header = buildDocumentHeaderRecord({
    recordNumberInFile: headerRecordNumber,
    vatId,
    documentType: DOCUMENT_TYPE_CODES.TAX_INVOICE,
    documentNumber: invoice.invoiceNumber ?? String(invoice.id),
    issueDate,
    partyName: invoice.clientName,
    partyVatId: invoice.clientTaxId,
    amountBeforeDiscount: subtotal,
    documentDiscount: 0, // Vixor invoices don't currently model a separate document-level discount distinct from per-line pricing
    amountAfterDiscountExclVat: subtotal,
    vatAmount,
    totalAmountInclVat: invoice.total,
    documentDate,
    cancelled: invoice.status === InvoiceStatus.CANCELLED,
    linkId,
    partyKey: resolvePartyKey(invoice.clientName, invoice.id, invoice.clientTaxId),
  });

  const vatRatePercent = deriveVatRatePercent(subtotal, vatAmount);
  const lines = invoice.items.map((item, i) =>
    buildDocumentLineRecord({
      recordNumberInFile: lineRecordNumberStart + i,
      vatId,
      documentType: DOCUMENT_TYPE_CODES.TAX_INVOICE,
      documentNumber: invoice.invoiceNumber ?? String(invoice.id),
      lineNumber: i + 1,
      itemDescription: item.description,
      unitDescription: 'יחידה',
      quantity: item.quantity,
      unitPriceExclVat: item.unitPrice,
      lineTotal: roundedLineTotal(item.quantity, item.unitPrice),
      vatRatePercent,
      documentDate,
      headerLinkId: linkId,
    }),
  );

  return { header, lines };
}

/** Every Vixor LedgerEntry is already fully balanced on its own (one
 * debitAccount + one creditAccount + one amount — see the entity's
 * own doc comment) unlike the spec's 100B, which wants a SEPARATE
 * record per leg. Splits each entry into exactly two 100B records
 * sharing one transaction number (the entry's own id), matching the
 * spec's own worked example (debit customer / credit VAT / credit
 * revenue as three separate same-transaction-number records). */
export function mapLedgerEntryToRecords(entry: LedgerEntry, vatId: string, recordNumberStart: number): string[] {
  const debitLeg = buildLedgerTransactionRecord({
    recordNumberInFile: recordNumberStart,
    vatId,
    transactionNumber: entry.id,
    lineNumberInTransaction: 1,
    details: entry.description,
    date: new Date(entry.date),
    valueDate: new Date(entry.date),
    accountKey: entry.debitAccount.code,
    isCredit: false,
    amount: entry.amount,
  });
  const creditLeg = buildLedgerTransactionRecord({
    recordNumberInFile: recordNumberStart + 1,
    vatId,
    transactionNumber: entry.id,
    lineNumberInTransaction: 2,
    details: entry.description,
    date: new Date(entry.date),
    valueDate: new Date(entry.date),
    accountKey: entry.creditAccount.code,
    isCredit: true,
    amount: entry.amount,
  });
  return [debitLeg, creditLeg];
}

/** One 110B per account, with its running debit/credit totals for
 * the export's own date range — the caller is responsible for
 * summing totalDebit/totalCredit from the LedgerEntry rows actually
 * included in this export (not the account's all-time totals),
 * since the spec's own field descriptions define these as period
 * totals, not lifetime ones. */
export function mapAccountToRecord(
  account: Account,
  vatId: string,
  recordNumber: number,
  openingBalance: number,
  totalDebit: number,
  totalCredit: number,
): string {
  return buildChartOfAccountRecord({
    recordNumberInFile: recordNumber,
    vatId,
    accountKey: account.code,
    accountName: account.name,
    openingBalance,
    totalDebit,
    totalCredit,
  });
}

/** One 100M per warehouse item. entriesInRange/exitsInRange must be
 * summed by the caller from WarehouseTransaction rows within the
 * export's own date range (same period-total reasoning as the ledger
 * account mapping above) — WarehouseItem.quantity itself is a live
 * current balance, not a point-in-time opening balance for an
 * arbitrary export range. */
export function mapWarehouseItemToRecord(
  item: WarehouseItem,
  vatId: string,
  recordNumber: number,
  openingBalance: number,
  entriesInRange: number,
  exitsInRange: number,
): string {
  return buildInventoryItemRecord({
    recordNumberInFile: recordNumber,
    vatId,
    internalSku: item.barcode,
    itemName: item.name,
    unitDescription: 'יחידה',
    openingBalance,
    totalEntries: entriesInRange,
    totalExits: exitsInRange,
    costPriceOutsideBondedWarehouse: item.price ?? 0,
  });
}

export interface HeaderAndLines {
  header: string;
  lines: string[];
}

/** Maps a DeliveryNote to 100C+110D. Deliberately all-zero amounts —
 * this app's delivery notes (an MC Music rental/equipment agreement,
 * per the entity's own doc comment) carry no pricing at all
 * (NoteItem has only quantity/name, no unitPrice), which is
 * explicitly normal and expected per the spec's own Appendix-1-
 * adjacent example table showing a real delivery-note row with
 * "כמותי 45, כספי 0" (45 delivery notes, ₪0 total) — pricing belongs
 * on the invoice raised from a note, not the note itself. */
export function mapDeliveryNoteToRecords(
  note: DeliveryNote,
  vatId: string,
  headerRecordNumber: number,
  lineRecordNumberStart: number,
): HeaderAndLines {
  const linkId = note.id;
  const issueDate = note.createdAt;
  const documentDate = note.date ? new Date(note.date) : note.createdAt;

  const header = buildDocumentHeaderRecord({
    recordNumberInFile: headerRecordNumber,
    vatId,
    documentType: DOCUMENT_TYPE_CODES.DELIVERY_NOTE,
    documentNumber: note.noteNumber ?? String(note.id),
    issueDate,
    partyName: note.clientName,
    partyStreet: note.clientAddress,
    amountBeforeDiscount: 0,
    documentDiscount: 0,
    amountAfterDiscountExclVat: 0,
    vatAmount: 0,
    totalAmountInclVat: 0,
    documentDate,
    cancelled: note.status === DeliveryNoteStatus.CANCELLED,
    linkId,
    partyKey: resolvePartyKey(note.clientName, note.id),
  });

  const lines = note.items.map((item, i) =>
    buildDocumentLineRecord({
      recordNumberInFile: lineRecordNumberStart + i,
      vatId,
      documentType: DOCUMENT_TYPE_CODES.DELIVERY_NOTE,
      documentNumber: note.noteNumber ?? String(note.id),
      lineNumber: i + 1,
      itemDescription: item.name,
      unitDescription: 'יחידה',
      quantity: item.quantity,
      vatRatePercent: 0,
      documentDate,
      headerLinkId: linkId,
    }),
  );

  return { header, lines };
}

/** Maps a CreditNote to 100C+110D under CREDIT_INVOICE (330) — same
 * shape as mapInvoiceToRecords since CreditNote's own data model
 * (items/total/currency/vatCategory) is deliberately identical to
 * Invoice's, per the entity's own doc comment ("inherited from the
 * invoice being corrected"). */
export function mapCreditNoteToRecords(
  note: CreditNote,
  vatId: string,
  headerRecordNumber: number,
  lineRecordNumberStart: number,
): HeaderAndLines {
  const subtotal = note.items.reduce((sum, it) => sum + roundedLineTotal(it.quantity, it.unitPrice), 0);
  const vatAmount = Math.max(0, note.total - subtotal);
  const linkId = note.id;
  const issueDate = note.createdAt;
  const documentDate = note.date ? new Date(note.date) : note.createdAt;

  const header = buildDocumentHeaderRecord({
    recordNumberInFile: headerRecordNumber,
    vatId,
    documentType: DOCUMENT_TYPE_CODES.CREDIT_INVOICE,
    documentNumber: note.creditNoteNumber ?? String(note.id),
    issueDate,
    partyName: note.clientName,
    amountBeforeDiscount: subtotal,
    documentDiscount: 0,
    amountAfterDiscountExclVat: subtotal,
    vatAmount,
    totalAmountInclVat: note.total,
    documentDate,
    linkId,
    partyKey: resolvePartyKey(note.clientName, note.id),
  });

  const vatRatePercent = deriveVatRatePercent(subtotal, vatAmount);
  const lines = note.items.map((item, i) =>
    buildDocumentLineRecord({
      recordNumberInFile: lineRecordNumberStart + i,
      vatId,
      documentType: DOCUMENT_TYPE_CODES.CREDIT_INVOICE,
      documentNumber: note.creditNoteNumber ?? String(note.id),
      lineNumber: i + 1,
      itemDescription: item.description,
      unitDescription: 'יחידה',
      quantity: item.quantity,
      unitPriceExclVat: item.unitPrice,
      lineTotal: roundedLineTotal(item.quantity, item.unitPrice),
      vatRatePercent,
      documentDate,
      headerLinkId: linkId,
    }),
  );

  return { header, lines };
}

/** Maps a DebitNote to 100C+110D under TAX_INVOICE (305) — NOT a
 * dedicated "debit note" type, because the spec's own Appendix 1
 * document-type table has no such code at all (only a credit-note
 * equivalent, 330, exists). This matches real Israeli tax practice:
 * an undercharge correction is normally issued as an ordinary
 * additional tax invoice for the difference, not a special document
 * type. This is a genuine interpretive judgment call, not a fact
 * looked up from the spec — worth confirming with an accountant
 * before relying on it, same as everything else in this module that
 * hasn't been run through the Tax Authority's own simulator yet. */
export function mapDebitNoteToRecords(
  note: DebitNote,
  vatId: string,
  headerRecordNumber: number,
  lineRecordNumberStart: number,
): HeaderAndLines {
  const subtotal = note.items.reduce((sum, it) => sum + roundedLineTotal(it.quantity, it.unitPrice), 0);
  const vatAmount = Math.max(0, note.total - subtotal);
  const linkId = note.id;
  const issueDate = note.createdAt;
  const documentDate = note.date ? new Date(note.date) : note.createdAt;

  const header = buildDocumentHeaderRecord({
    recordNumberInFile: headerRecordNumber,
    vatId,
    documentType: DOCUMENT_TYPE_CODES.TAX_INVOICE,
    documentNumber: note.debitNoteNumber ?? String(note.id),
    issueDate,
    partyName: note.clientName,
    amountBeforeDiscount: subtotal,
    documentDiscount: 0,
    amountAfterDiscountExclVat: subtotal,
    vatAmount,
    totalAmountInclVat: note.total,
    documentDate,
    linkId,
    partyKey: resolvePartyKey(note.clientName, note.id),
  });

  const vatRatePercent = deriveVatRatePercent(subtotal, vatAmount);
  const lines = note.items.map((item, i) =>
    buildDocumentLineRecord({
      recordNumberInFile: lineRecordNumberStart + i,
      vatId,
      documentType: DOCUMENT_TYPE_CODES.TAX_INVOICE,
      documentNumber: note.debitNoteNumber ?? String(note.id),
      lineNumber: i + 1,
      itemDescription: item.description,
      unitDescription: 'יחידה',
      quantity: item.quantity,
      unitPriceExclVat: item.unitPrice,
      lineTotal: roundedLineTotal(item.quantity, item.unitPrice),
      vatRatePercent,
      documentDate,
      headerLinkId: linkId,
    }),
  );

  return { header, lines };
}

/** Maps a Payment to 100C (RECEIPT, 400) + exactly one 120D payment-
 * method-detail line — a payment is a single amount, not itemized
 * goods, so it uses 120D (the spec's own "receipt/deposit details"
 * record) rather than 110D. Check-specific and card-specific fields
 * only carry through when the payment's own method actually matches
 * (mapVixorPaymentMethod + the isCheck/isCard branches inside
 * buildReceiptLineRecord already handle this correctly — see that
 * function's own logic). */
export function mapPaymentToRecords(
  payment: Payment,
  vatId: string,
  headerRecordNumber: number,
  lineRecordNumber: number,
): HeaderAndLines {
  const linkId = payment.id;
  const issueDate = payment.createdAt;
  const documentDate = payment.date ? new Date(payment.date) : payment.createdAt;

  const header = buildDocumentHeaderRecord({
    recordNumberInFile: headerRecordNumber,
    vatId,
    documentType: DOCUMENT_TYPE_CODES.RECEIPT,
    documentNumber: payment.paymentNumber ?? String(payment.id),
    issueDate,
    partyName: payment.clientName,
    amountBeforeDiscount: payment.amount,
    documentDiscount: 0,
    amountAfterDiscountExclVat: payment.amount,
    vatAmount: 0, // a receipt records money already collected on a previously-taxed invoice — no separate VAT event of its own
    totalAmountInclVat: payment.amount,
    documentDate,
    linkId,
    partyKey: resolvePartyKey(payment.clientName, payment.id),
  });

  const line = buildReceiptLineRecord({
    recordNumberInFile: lineRecordNumber,
    vatId,
    documentType: DOCUMENT_TYPE_CODES.RECEIPT,
    documentNumber: payment.paymentNumber ?? String(payment.id),
    lineNumber: 1,
    paymentMethod: mapVixorPaymentMethod(payment.method),
    // bankNumber is a numeric bank-routing code in the spec; Vixor's
    // Payment only stores bankName as a plain string (a bank's NAME,
    // e.g. "Bank Hapoalim"), which has no corresponding numeric field
    // to safely go into here — left unset rather than parseInt'ing a
    // name into garbage digits. branchNumber/accountNumber below ARE
    // genuinely numeric-content strings on Payment (unlike bankName),
    // so those pass through correctly.
    branchNumber: payment.branchNumber ?? undefined,
    accountNumber: payment.accountNumber ?? undefined,
    checkNumber: payment.checkNumber ?? undefined,
    dueDate: payment.checkDate ? new Date(payment.checkDate) : undefined,
    lineAmount: payment.amount,
    cardName: payment.cardType ?? undefined,
    documentDate,
    headerLinkId: linkId,
  });

  return { header, lines: [line] };
}

/** Maps a SupplierInvoice to 100C+110D under PURCHASE_TAX_INVOICE
 * (700) — the purchase-side counterpart of mapInvoiceToRecords,
 * representing real money owed/spent that a real audit trail needs
 * to include (this was the single biggest gap found reviewing this
 * module's coverage: purchase-side documents weren't mapped to
 * anything at all before this).
 *
 * Genuine data-model limitation, not a bug to silently paper over:
 * SupplierInvoice.amount is a single figure with no pre/post-VAT
 * breakdown (unlike Invoice, which has separate line items priced
 * excl. VAT) — treated here as the VAT-INCLUSIVE total with the VAT
 * portion left at 0 rather than guessed at a rate that might not
 * match what the supplier actually charged. A business that needs
 * accurate input-VAT-credit tracking from this export specifically
 * would need SupplierInvoice to record a real VAT breakdown, which
 * it doesn't today — worth flagging, not something this mapping
 * function alone can fix. */
export function mapSupplierInvoiceToRecords(
  invoice: SupplierInvoice,
  vatId: string,
  headerRecordNumber: number,
  lineRecordNumber: number,
): HeaderAndLines {
  const linkId = invoice.id;
  const issueDate = invoice.createdAt;
  const documentDate = new Date(invoice.date);

  const header = buildDocumentHeaderRecord({
    recordNumberInFile: headerRecordNumber,
    vatId,
    documentType: DOCUMENT_TYPE_CODES.PURCHASE_TAX_INVOICE,
    documentNumber: invoice.invoiceNumber ?? String(invoice.id),
    issueDate,
    partyName: invoice.supplierName,
    amountBeforeDiscount: invoice.amount,
    documentDiscount: 0,
    amountAfterDiscountExclVat: invoice.amount,
    vatAmount: 0, // see this function's own doc comment
    totalAmountInclVat: invoice.amount,
    documentDate,
    linkId,
    partyKey: resolvePartyKey(invoice.supplierName, invoice.id),
  });

  const line = buildDocumentLineRecord({
    recordNumberInFile: lineRecordNumber,
    vatId,
    documentType: DOCUMENT_TYPE_CODES.PURCHASE_TAX_INVOICE,
    documentNumber: invoice.invoiceNumber ?? String(invoice.id),
    lineNumber: 1,
    itemDescription: invoice.description || invoice.supplierName,
    unitDescription: 'יחידה',
    quantity: 1,
    unitPriceExclVat: invoice.amount,
    lineTotal: invoice.amount,
    vatRatePercent: 0, // matches the header's own vatAmount: 0 — see this function's doc comment
    documentDate,
    headerLinkId: linkId,
  });

  return { header, lines: [line] };
}

/** Maps an Expense (cash/bank paid immediately, no supplier tracked —
 * see the entity's own doc comment) to 100C+120D under CASH_OUT
 * (410, "יציאה מקופה") — the closest real match in the spec's
 * document-type table for money leaving the business with no
 * associated party name, as opposed to SupplierInvoice's proper
 * vendor-billing shape (mapped above to 700 instead). */
export function mapExpenseToRecords(
  expense: Expense,
  vatId: string,
  headerRecordNumber: number,
  lineRecordNumber: number,
): HeaderAndLines {
  const linkId = expense.id;
  const issueDate = expense.createdAt;
  const documentDate = new Date(expense.date);

  const header = buildDocumentHeaderRecord({
    recordNumberInFile: headerRecordNumber,
    vatId,
    documentType: DOCUMENT_TYPE_CODES.CASH_OUT,
    documentNumber: String(expense.id),
    issueDate,
    amountBeforeDiscount: expense.amount,
    documentDiscount: 0,
    amountAfterDiscountExclVat: expense.amount,
    vatAmount: 0,
    totalAmountInclVat: expense.amount,
    documentDate,
    linkId,
    partyKey: resolvePartyKey(undefined, expense.id),
  });

  const line = buildReceiptLineRecord({
    recordNumberInFile: lineRecordNumber,
    vatId,
    documentType: DOCUMENT_TYPE_CODES.CASH_OUT,
    documentNumber: String(expense.id),
    lineNumber: 1,
    paymentMethod: mapVixorPaymentMethod(expense.method),
    branchNumber: expense.branchNumber ?? undefined,
    accountNumber: expense.accountNumber ?? undefined,
    checkNumber: expense.checkNumber ?? undefined,
    dueDate: expense.checkDate ? new Date(expense.checkDate) : undefined,
    lineAmount: expense.amount,
    cardName: expense.cardType ?? undefined,
    documentDate,
    headerLinkId: linkId,
  });

  return { header, lines: [line] };
}

/** Maps a ReturnNote to 100C+110D under RETURN_NOTE (210) — same
 * all-zero-amount shape as mapDeliveryNoteToRecords, for the same
 * reason: ReturnNote.items has only name/quantity, no pricing (it's
 * about physical goods movement, not money — see the entity's own
 * doc comment distinguishing it from a credit note). */
export function mapReturnNoteToRecords(
  note: ReturnNote,
  vatId: string,
  headerRecordNumber: number,
  lineRecordNumberStart: number,
): HeaderAndLines {
  const linkId = note.id;
  const issueDate = note.createdAt;
  const documentDate = note.date ? new Date(note.date) : note.createdAt;

  const header = buildDocumentHeaderRecord({
    recordNumberInFile: headerRecordNumber,
    vatId,
    documentType: DOCUMENT_TYPE_CODES.RETURN_NOTE,
    documentNumber: note.returnNumber ?? String(note.id),
    issueDate,
    partyName: note.clientName,
    amountBeforeDiscount: 0,
    documentDiscount: 0,
    amountAfterDiscountExclVat: 0,
    vatAmount: 0,
    totalAmountInclVat: 0,
    documentDate,
    linkId,
    partyKey: resolvePartyKey(note.clientName, note.id),
  });

  const lines = note.items.map((item, i) =>
    buildDocumentLineRecord({
      recordNumberInFile: lineRecordNumberStart + i,
      vatId,
      documentType: DOCUMENT_TYPE_CODES.RETURN_NOTE,
      documentNumber: note.returnNumber ?? String(note.id),
      lineNumber: i + 1,
      itemDescription: item.name,
      unitDescription: 'יחידה',
      quantity: item.quantity,
      vatRatePercent: 0,
      documentDate,
      headerLinkId: linkId,
    }),
  );

  return { header, lines };
}
