import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../invoices/entities/invoice.entity';
import { TaxAuthoritySettingsService } from './tax-authority-settings.service';
import { TaxAuthorityInvoiceApiService } from './tax-authority-invoice-api.service';
import { VAT_RATE } from '../documents/document-pdf.util';

const TAX_INVOICE_DOC_TYPE = 305; // חשבונית מס — see Table 2.5 in the spec

/**
 * Decides WHETHER a given invoice needs an allocation number and, if
 * so, requests one and updates the invoice record. This is the single
 * integration point InvoicesService calls — it never has to know the
 * details of the ITA's API itself.
 *
 * Eligibility per the spec's four cumulative conditions (section 1.2):
 *  1. amount before VAT > threshold
 *  2. VAT component is non-zero
 *  3. customer is a "עוסק מורשה" (registered dealer) — approximated
 *     here by "has a clientTaxId", since this app has no other signal
 *     for customer registration status
 *  4. the customer actually asked for one — this app can't know that
 *     without asking, so it's treated as "yes" whenever conditions
 *     1-3 hold, erring toward requesting a number rather than
 *     silently skipping one a customer might need for their own VAT
 *     deduction.
 */
@Injectable()
export class TaxAuthorityAllocationService {
  private readonly logger = new Logger(TaxAuthorityAllocationService.name);

  constructor(
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    private readonly settingsService: TaxAuthoritySettingsService,
    private readonly api: TaxAuthorityInvoiceApiService,
  ) {}

  /** Best-effort, never throws — called right after an invoice is
   * created/finalized. A failure here (ITA down, network error, not
   * yet connected) must never block issuing the invoice itself; the
   * invoice just goes out with allocationStatus left as 'pending' or
   * 'error' for the admin to handle via the "4 alternatives" flow
   * (see requirement #6's עיכוב חשבונית section) rather than silently
   * losing the attempt. */
  async maybeRequestAllocation(invoice: Invoice, organizationId: number, vatEnabled: boolean): Promise<void> {
    try {
      const settings = await this.settingsService.findWithSecrets(organizationId);
      if (!settings?.enabled) return; // integration not turned on for this org — leave allocationStatus as not_applicable

      const vatAmount = vatEnabled ? Math.round(invoice.total * VAT_RATE * 100) / 100 : 0;
      const eligible = invoice.total > settings.thresholdAmount && vatAmount > 0 && !!invoice.clientTaxId;
      if (!eligible) return;

      invoice.allocationStatus = 'pending';
      await this.invoicesRepo.save(invoice);

      const result = await this.api.requestAllocation(settings, {
        invoiceId: `inv-${invoice.id}`,
        documentTypeCode: TAX_INVOICE_DOC_TYPE,
        referenceNumber: invoice.invoiceNumber ?? String(invoice.id),
        customerVatNumber: invoice.clientTaxId,
        customerName: invoice.clientName,
        date: invoice.date ?? new Date().toISOString().slice(0, 10),
        issuanceDate: new Date().toISOString().slice(0, 10),
        discountBeforeAmount: invoice.total,
        discount: 0,
        amountPayment: invoice.total,
        amountVat: vatAmount,
        paymentAmountIncludingVat: invoice.total + vatAmount,
        items: invoice.items.map((item, i) => {
          const lineTotal = item.quantity * item.unitPrice;
          const lineVat = Math.round(lineTotal * VAT_RATE * 100) / 100;
          return {
            index: i + 1,
            description: item.description,
            quantity: item.quantity,
            pricePerUnit: item.unitPrice,
            amountTotal: lineTotal,
            vatRate: VAT_RATE * 100,
            vatAmount: lineVat,
          };
        }),
      });

      if (result.approved) {
        invoice.allocationNumber = result.shortConfirmationNumber;
        invoice.allocationStatus = 'approved';
      } else {
        invoice.allocationStatus = 'refused';
        this.logger.warn(`Allocation refused for invoice ${invoice.id}: ${JSON.stringify(result.errors)}`);
      }
      await this.invoicesRepo.save(invoice);
    } catch (err) {
      invoice.allocationStatus = 'error';
      await this.invoicesRepo.save(invoice).catch(() => {});
      this.logger.error(`Allocation request failed for invoice ${invoice.id}: ${(err as Error).message}`);
    }
  }
}
