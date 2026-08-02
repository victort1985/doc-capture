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
  const subtotal = invoice.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
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
      lineTotal: item.quantity * item.unitPrice,
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
  const subtotal = note.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
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
      lineTotal: item.quantity * item.unitPrice,
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
  const subtotal = note.items.reduce((sum, it) => sum + it.quantity * it.unitPrice, 0);
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
      lineTotal: item.quantity * item.unitPrice,
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
