import { Injectable } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { VAT_RATE } from '../documents/document-pdf.util';
import { PaymentMethod } from '../payments/entities/payment.entity';

/**
 * Auto-posts the standard double-entry pair for each document type
 * that has an accounting effect. Kept as its own thin service (rather
 * than baking postEntry() calls directly into invoices/payments/
 * credit-notes services) so the accounting rules live in one place,
 * and so a document service only needs to know "post this invoice",
 * not the actual debit/credit account codes.
 *
 * Deliberately best-effort everywhere it's called from: a posting
 * failure must never block the actual business action (creating the
 * invoice/payment/etc still succeeds even if, say, an org's chart of
 * accounts got into a bad state) - callers wrap these in try/catch.
 */
@Injectable()
export class LedgerPostingService {
  constructor(private readonly accounting: AccountingService) {}

  /** Invoice issued: money owed goes up (debit Accounts Receivable),
   * revenue goes up (credit Sales Revenue) — VAT, if any, is credited
   * separately to VAT Payable rather than folded into revenue, since
   * VAT collected isn't the org's income, it's money held for the Tax
   * Authority. */
  async postInvoice(organizationId: number, invoiceId: number, date: string, subtotal: number, vat: number, clientName: string): Promise<void> {
    const ar = await this.accounting.getSystemAccount(organizationId, '1100');
    const revenue = await this.accounting.getSystemAccount(organizationId, '4000');
    await this.accounting.postEntry(organizationId, date, `חשבונית — ${clientName}`, ar.id, revenue.id, subtotal, 'invoice', invoiceId);
    if (vat > 0) {
      const vatPayable = await this.accounting.getSystemAccount(organizationId, '2100');
      await this.accounting.postEntry(organizationId, date, `מע"מ — חשבונית ${invoiceId}`, ar.id, vatPayable.id, vat, 'invoice-vat', invoiceId);
    }
  }

  /** Payment received: cash/bank goes up (debit), what the client
   * owed goes down (credit Accounts Receivable) — the receivable
   * balance dropping to zero across an invoice + its payment(s) is
   * exactly what "this invoice is paid" means in the ledger. */
  async postPayment(organizationId: number, paymentId: number, date: string, amount: number, method: string, clientName: string): Promise<void> {
    const cashLike = method === 'cash'
      ? await this.accounting.getSystemAccount(organizationId, '1000')
      : await this.accounting.getSystemAccount(organizationId, '1010'); // everything non-cash lands in "Bank" for simplicity
    const ar = await this.accounting.getSystemAccount(organizationId, '1100');
    await this.accounting.postEntry(organizationId, date, `תשלום — ${clientName}`, cashLike.id, ar.id, amount, 'payment', paymentId);
  }

  /** Credit note: exact reversal of an invoice posting — revenue
   * (and VAT, if any) goes back down, what the client owes goes down
   * by the same amount. */
  /** Reverses revenue AND the corresponding VAT (if the invoice being
   * corrected had any) — a credit note against a VATed invoice isn't
   * fully reflected in the books if only the revenue side unwinds and
   * the VAT Payable balance is left untouched, since that VAT was
   * never actually collectible anymore either. */
  async postCreditNote(organizationId: number, creditNoteId: number, date: string, amount: number, clientName: string, vatEnabled = false): Promise<void> {
    const ar = await this.accounting.getSystemAccount(organizationId, '1100');
    const revenue = await this.accounting.getSystemAccount(organizationId, '4000');
    await this.accounting.postEntry(organizationId, date, `זיכוי — ${clientName}`, revenue.id, ar.id, amount, 'credit-note', creditNoteId);
    if (vatEnabled) {
      const vatAmount = Math.round(amount * VAT_RATE * 100) / 100;
      const vatPayable = await this.accounting.getSystemAccount(organizationId, '2100');
      await this.accounting.postEntry(organizationId, date, `מע"מ — זיכוי ${creditNoteId}`, vatPayable.id, ar.id, vatAmount, 'credit-note-vat', creditNoteId);
    }
  }

  /** Debit note: the inverse of a credit note — an additional charge
   * on top of what was already invoiced, including the corresponding
   * additional VAT if applicable (same reasoning as postCreditNote,
   * mirrored). */
  async postDebitNote(organizationId: number, debitNoteId: number, date: string, amount: number, clientName: string, vatEnabled = false): Promise<void> {
    const ar = await this.accounting.getSystemAccount(organizationId, '1100');
    const revenue = await this.accounting.getSystemAccount(organizationId, '4000');
    await this.accounting.postEntry(organizationId, date, `חיוב נוסף — ${clientName}`, ar.id, revenue.id, amount, 'debit-note', debitNoteId);
    if (vatEnabled) {
      const vatAmount = Math.round(amount * VAT_RATE * 100) / 100;
      const vatPayable = await this.accounting.getSystemAccount(organizationId, '2100');
      await this.accounting.postEntry(organizationId, date, `מע"מ — חיוב נוסף ${debitNoteId}`, ar.id, vatPayable.id, vatAmount, 'debit-note-vat', debitNoteId);
    }
  }

  /** Direct expense: paid immediately, debit General Expenses, credit
   * whichever of Cash/Bank it came from. */
  async postExpense(organizationId: number, expenseId: number, date: string, amount: number, method: PaymentMethod, description: string): Promise<void> {
    const expenses = await this.accounting.getSystemAccount(organizationId, '5000');
    const cashLike = method === PaymentMethod.CASH
      ? await this.accounting.getSystemAccount(organizationId, '1000')
      : await this.accounting.getSystemAccount(organizationId, '1010');
    await this.accounting.postEntry(organizationId, date, `הוצאה — ${description}`, expenses.id, cashLike.id, amount, 'expense', expenseId);
  }

  /** Supplier invoice: owed the moment it's recorded (debit Purchases,
   * credit Accounts Payable) — independent of when it's actually
   * paid, which posts separately via postSupplierPayment. */
  async postSupplierInvoice(organizationId: number, supplierInvoiceId: number, date: string, amount: number, supplierName: string): Promise<void> {
    const purchases = await this.accounting.getSystemAccount(organizationId, '5100');
    const ap = await this.accounting.getSystemAccount(organizationId, '2000');
    await this.accounting.postEntry(organizationId, date, `חשבונית ספק — ${supplierName}`, purchases.id, ap.id, amount, 'supplier-invoice', supplierInvoiceId);
  }

  /** Marking a supplier invoice paid: debit Accounts Payable (what's
   * owed goes down), credit Cash/Bank (money actually left). */
  async postSupplierPayment(organizationId: number, supplierInvoiceId: number, date: string, amount: number, method: PaymentMethod, supplierName: string): Promise<void> {
    const ap = await this.accounting.getSystemAccount(organizationId, '2000');
    const cashLike = method === PaymentMethod.CASH
      ? await this.accounting.getSystemAccount(organizationId, '1000')
      : await this.accounting.getSystemAccount(organizationId, '1010');
    await this.accounting.postEntry(organizationId, date, `תשלום לספק — ${supplierName}`, ap.id, cashLike.id, amount, 'supplier-payment', supplierInvoiceId);
  }
}
