import { DOCUMENT_TYPE_CODES } from './document-type-codes';
import { buildDocumentHeaderRecord, buildDocumentLineRecord } from './document-records';
import { buildLedgerTransactionRecord, buildChartOfAccountRecord } from './ledger-records';
import { buildInventoryItemRecord } from './inventory-records';
import type { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceStatus } from '../invoices/entities/invoice.entity';
import type { LedgerEntry } from '../accounting/entities/ledger-entry.entity';
import type { Account } from '../accounting/entities/account.entity';
import type { WarehouseItem } from '../warehouse/entities/warehouse-item.entity';

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
    partyKey: invoice.clientName, // no separate client-id field on Invoice today — see mapping note below
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
