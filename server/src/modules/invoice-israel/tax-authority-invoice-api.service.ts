import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaxAuthoritySettings } from './entities/tax-authority-settings.entity';
import { TaxAuthorityOAuthService } from './tax-authority-oauth.service';

// NOTE ON HOSTS: the invoice-approval API and the OAuth token service
// live on DIFFERENT hostnames in the ITA's own documentation —
// ita-api.taxes.gov.il for this service, openapi.taxes.gov.il for
// OAuth (see tax-authority-oauth.service.ts). The sandbox path
// segment is also capitalized differently between the two documents
// ("tsandbox" here vs "Tsandbox" in the OAuth guide) — preserved
// exactly as each official document shows it rather than assuming
// they're typos, since a wrong guess here fails silently as a 404
// rather than an obvious error.
const APPROVAL_URLS = {
  sandbox: 'https://ita-api.taxes.gov.il/shaam/tsandbox/Invoices/v2/Approval',
  production: 'https://ita-api.taxes.gov.il/shaam/production/Invoices/v2/Approval',
};

export interface AllocationLineItem {
  index: number;
  description: string;
  quantity: number;
  pricePerUnit: number;
  amountTotal: number;
  vatRate: number;
  vatAmount: number;
  catalogId?: string;
  measureUnitDescription?: string;
}

export interface AllocationRequest {
  /** Unique per invoice — reused as id_invoice for retries/decisions,
   * per the spec's "כל פניה בגין חשבונית חייבת לכלול מספר מזהה חד
   * ערכי". Using this app's own invoice ID (prefixed) satisfies that
   * uniqueness requirement without needing a separate ID scheme. */
  invoiceId: string;
  /** type_invoice — 305 for a standard tax invoice, 320 for tax
   * invoice/receipt combined, etc. See Table 2.5 in the spec. Credit
   * notes (330) are explicitly NOT eligible for an allocation number
   * per the same table — don't call this for those. */
  documentTypeCode: number;
  referenceNumber: string;
  customerVatNumber?: string;
  customerName?: string;
  date: string; // YYYY-MM-DD
  issuanceDate: string; // YYYY-MM-DD
  discountBeforeAmount: number;
  discount: number;
  amountPayment: number; // subtotal before VAT
  amountVat: number;
  paymentAmountIncludingVat: number;
  items: AllocationLineItem[];
  note?: string;
  userIdNumber?: string; // id number of whoever's actually issuing it
  userName?: string; // required if userIdNumber isn't sent
}

export interface AllocationResult {
  approved: boolean;
  confirmationNumber: string | null;
  /** Last 9 digits — what actually gets printed on the invoice per
   * the spec ("הדפסת מספר ההקצאה ... הדגשה ברורה של 9 הספרות
   * הימניות"). */
  shortConfirmationNumber: string | null;
  errors: { code: number; message: string; param?: string }[];
  rawResponse: unknown;
}

@Injectable()
export class TaxAuthorityInvoiceApiService {
  private readonly logger = new Logger(TaxAuthorityInvoiceApiService.name);

  constructor(
    @InjectRepository(TaxAuthoritySettings) private readonly settingsRepo: Repository<TaxAuthoritySettings>,
    private readonly oauth: TaxAuthorityOAuthService,
  ) {}

  /** Requests an allocation number for one invoice. Field names below
   * match Table 2.1 in "מודל חשבוניות ישראל" edition 2.0/7.2024
   * exactly — see that table for the full field-by-field spec
   * (required/optional, max lengths, etc). This does NOT decide
   * whether an invoice needs an allocation number in the first place
   * (threshold/VAT/customer-type checks) — that's the caller's job,
   * see InvoicesService's integration point. */
  async requestAllocation(settings: TaxAuthoritySettings, req: AllocationRequest): Promise<AllocationResult> {
    const token = await this.oauth.getValidAccessToken(settings);
    const url = APPROVAL_URLS[settings.environment];

    const body = {
      id_invoice: req.invoiceId,
      type_invoice: req.documentTypeCode,
      number_vat: settings.vatNumber,
      invoice_reference_number: req.referenceNumber,
      number_vat_customer: req.customerVatNumber,
      name_customer: req.customerName,
      date_invoice: req.date,
      date_issuance_invoice: req.issuanceDate,
      accounting_software_number: settings.softwareRegistrationNumber || settings.vatNumber,
      discount_before_amount: req.discountBeforeAmount,
      discount: req.discount,
      amount_payment: req.amountPayment,
      amount_vat: req.amountVat,
      payment_amount_including_vat: req.paymentAmountIncludingVat,
      note_invoice: req.note,
      id_user: req.userIdNumber,
      name_user: req.userName,
      Items: req.items.map((item) => ({
        Index: item.index,
        id_catalog: item.catalogId,
        Description: item.description,
        measure_unit_description: item.measureUnitDescription,
        Quantity: item.quantity,
        price_per_unit: item.pricePerUnit,
        amount_total: item.amountTotal,
        vat_rate: item.vatRate,
        amount_vat: item.vatAmount,
      })),
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(`Network error calling Tax Authority Approval API: ${(err as Error).message}`);
      return { approved: false, confirmationNumber: null, shortConfirmationNumber: null, errors: [{ code: -1, message: `Network error: ${(err as Error).message}` }], rawResponse: null };
    }

    const json = await res.json().catch(() => null) as
      | { status: number; message: string | { errors: { code: number; message: string; param?: string }[] }; confirmation_number?: string; approved?: boolean }
      | null;

    if (!json) {
      return { approved: false, confirmationNumber: null, shortConfirmationNumber: null, errors: [{ code: res.status, message: 'Non-JSON or empty response from Tax Authority' }], rawResponse: null };
    }

    const errors = typeof json.message === 'object' && json.message?.errors ? json.message.errors : [];
    const confirmationNumber = json.confirmation_number && json.confirmation_number !== '0' ? json.confirmation_number : null;

    return {
      approved: Boolean(json.approved) && confirmationNumber != null,
      confirmationNumber,
      // "9 הספרות הימניות" — the rightmost 9 digits, per the spec.
      shortConfirmationNumber: confirmationNumber ? confirmationNumber.slice(-9) : null,
      errors,
      rawResponse: json,
    };
  }

  /** One of the 4 alternatives when a request comes back refused (not
   * on a technical/data error, but an actual ITA hold) — see
   * requirement #6's "עיכוב חשבונית" (section 2.2.2/4 in the spec).
   * Reverse-charge (option 3) isn't handled here since the spec says
   * it goes through the SAME Approval endpoint with action=3 and a
   * fresh zero-VAT invoice, not this decision endpoint. */
  async submitDecision(settings: TaxAuthoritySettings, invoiceId: string, decision: 'cancel' | 'continue' | 'furtherObjection'): Promise<{ ok: boolean; message: string }> {
    const token = await this.oauth.getValidAccessToken(settings);
    const pathSegment = decision === 'cancel' ? 'Cancel' : decision === 'continue' ? 'Continue' : 'FurtherObjection';
    const url = `https://ita-api.taxes.gov.il/shaam/${settings.environment}/Invoice-decision/v1/${pathSegment}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id_invoice: invoiceId,
        number_vat: settings.vatNumber,
        accounting_software_number: settings.softwareRegistrationNumber || settings.vatNumber,
      }),
    });
    const json = await res.json().catch(() => null) as { status: number; message: string } | null;
    return { ok: res.ok && json?.status === 200, message: typeof json?.message === 'string' ? json.message : `HTTP ${res.status}` };
  }
}
