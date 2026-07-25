import { Injectable } from '@nestjs/common';
import { AccountingService } from './accounting.service';

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
  async postCreditNote(organizationId: number, creditNoteId: number, date: string, amount: number, clientName: string): Promise<void> {
    const ar = await this.accounting.getSystemAccount(organizationId, '1100');
    const revenue = await this.accounting.getSystemAccount(organizationId, '4000');
    await this.accounting.postEntry(organizationId, date, `זיכוי — ${clientName}`, revenue.id, ar.id, amount, 'credit-note', creditNoteId);
  }

  /** Debit note: the inverse of a credit note — an additional charge
   * on top of what was already invoiced. */
  async postDebitNote(organizationId: number, debitNoteId: number, date: string, amount: number, clientName: string): Promise<void> {
    const ar = await this.accounting.getSystemAccount(organizationId, '1100');
    const revenue = await this.accounting.getSystemAccount(organizationId, '4000');
    await this.accounting.postEntry(organizationId, date, `חיוב נוסף — ${clientName}`, ar.id, revenue.id, amount, 'debit-note', debitNoteId);
  }
}
