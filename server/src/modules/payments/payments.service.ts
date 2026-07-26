import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Payment } from './entities/payment.entity';
import { PaymentSettings } from './entities/payment-settings.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageService } from '../storage/storage.service';
import { generateDocumentPdf } from '../documents/document-pdf.util';
import { DocumentSendingService } from '../document-email/document-sending.service';
import { Invoice } from '../invoices/entities/invoice.entity';
import { OrderChainService } from '../order-chain/order-chain.service';
import { writeMaybeEncrypted, readMaybeEncrypted } from '../../common/crypto/encrypted-storage.util';
import { LedgerPostingService } from '../accounting/ledger-posting.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly repo: Repository<Payment>,
    @InjectRepository(PaymentSettings) private readonly settingsRepo: Repository<PaymentSettings>,
    @InjectRepository(DeliveryNoteSettings) private readonly noteSettingsRepo: Repository<DeliveryNoteSettings>,
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    private readonly storageService: StorageService,
    private readonly documentSendingService: DocumentSendingService,
    private readonly orderChainService: OrderChainService,
    private readonly ledgerPostingService: LedgerPostingService,
  ) {}

  /** See QuotesService.generateQuoteNumber — same fix, same reasoning:
   * a persistent counter, never COUNT(*) of existing rows. */
  private async generatePaymentNumber(organizationId: number | null): Promise<string> {
    if (organizationId == null) {
      const count = await this.repo.count({});
      return `#${count + 1}`;
    }

    let settings = await this.settingsRepo.findOne({ where: { organization: { id: organizationId } } });
    if (!settings) settings = await this.settingsRepo.save(this.settingsRepo.create({ organization: { id: organizationId } as any }));

    const claimed = settings.nextSequence ?? 1;
    await this.settingsRepo.increment({ id: settings.id }, 'nextSequence', 1);

    if (settings.numberLocked && settings.startingNumber != null) {
      return `${settings.numberPrefix ?? ''}${settings.startingNumber + claimed - 1}`;
    }
    return `#${claimed}`;
  }

  async findAll(organizationId: number | null): Promise<Payment[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, organizationId: number | null): Promise<Payment> {
    const payment = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!payment) throw new NotFoundException('Payment not found');
    if (organizationId != null && payment.organization?.id !== organizationId) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  /** @returns the saved payment plus the ONE-TIME original receipt PDF
   * (base64) — this is the only place in the whole API surface that
   * ever hands out the unstamped original; every other read of this
   * payment's PDF (GET /payments/:id/pdf) always returns the נאמן
   * למקור-stamped copy from here on, per the legal requirement that
   * an original may only be issued once. */
  async create(organizationId: number | null, userId: number, dto: CreatePaymentDto): Promise<{ payment: Payment; originalPdfBase64: string | null }> {
    const chainId = await this.resolveChainIdForCreate(dto.invoiceId, dto.chainId);
    const payment = this.repo.create({
      paymentNumber: await this.generatePaymentNumber(organizationId),
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      date: dto.date ?? new Date().toISOString().slice(0, 10),
      amount: dto.amount,
      method: dto.method,
      notes: dto.notes,
      cardLast4: dto.cardLast4,
      cardType: dto.cardType,
      approvalNumber: dto.approvalNumber,
      installments: dto.installments,
      checkNumber: dto.checkNumber,
      bankName: dto.bankName,
      branchNumber: dto.branchNumber,
      accountNumber: dto.accountNumber,
      checkDate: dto.checkDate,
      referenceNumber: dto.referenceNumber,
      invoiceId: dto.invoiceId,
      chainId,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    const saved = await this.repo.save(payment);
    const { path, bytes } = await this.tryGeneratePdf(saved, organizationId);
    saved.storagePath = path;
    await this.repo.save(saved);

    // Recording this payment is what completes the chain (see
    // order-chain module) — build the combined "everything about this
    // order" PDF now, once, rather than on every future view. Non-
    // fatal: a failure here shouldn't undo an otherwise-successful
    // payment record.
    if (chainId) {
      try {
        saved.chainSummaryPath = await this.orderChainService.generateChainSummaryPdf(chainId, organizationId);
        await this.repo.save(saved);
      } catch {
        // best-effort — see comment above
      }
    }

    if (organizationId != null) {
      try {
        await this.ledgerPostingService.postPayment(organizationId, saved.id, saved.date ?? new Date().toISOString().slice(0, 10), saved.amount, saved.method, saved.clientName);
      } catch {
        // best-effort — see comment above
      }
    }

    return { payment: saved, originalPdfBase64: bytes ? bytes.toString('base64') : null };
  }

  /** Joins the chain of the linked invoice, back-filling it with a
   * fresh chainId first if it never had one — same pattern as
   * InvoicesService.resolveChainIdForCreate. Payment is the last link:
   * a chain with a Payment in it is what order-chain considers
   * "complete". */
  private async resolveChainIdForCreate(invoiceId: number | undefined, explicitChainId: string | undefined): Promise<string> {
    if (invoiceId) {
      const invoice = await this.invoicesRepo.findOne({ where: { id: invoiceId } });
      if (invoice) {
        if (!invoice.chainId) {
          invoice.chainId = crypto.randomUUID();
          await this.invoicesRepo.save(invoice);
        }
        return invoice.chainId;
      }
    }
    return explicitChainId || crypto.randomUUID();
  }

  /** Renders the receipt PDF bytes — shared by the original-at-creation
   * path and the on-demand "certified true copy" path, so both always
   * look identical apart from the stamp. */
  private async renderPdfBytes(payment: Payment, settings: PaymentSettings, stampText?: string): Promise<Buffer> {
    const header = (await this.noteSettingsRepo.findOne({ where: { organization: { id: settings.organization?.id } } })) ?? {};
    return generateDocumentPdf({
      docTypeLabel: 'קבלה',
      docNumber: payment.paymentNumber ?? `#${payment.id}`,
      date: payment.date ?? new Date().toISOString().slice(0, 10),
      clientName: payment.clientName,
      clientEmail: payment.clientEmail,
      items: [{ description: this.paymentLineDescription(payment), quantity: 1, unitPrice: payment.amount }],
      total: payment.amount,
      footerText: settings.footerText,
      header,
      template: (settings.template as any) ?? 'classic',
      isDemoMode: settings.organization?.isDemoMode ?? false,
      vatEnabled: settings.vatEnabled,
      stampText,
    });
  }

  private async tryGeneratePdf(payment: Payment, organizationId: number | null, throwOnError = false): Promise<{ path: string | null; bytes: Buffer | null }> {
    if (organizationId == null) {
      if (throwOnError) {
        throw new BadRequestException(
          'This account isn\'t assigned to an organization, so there\'s no Payment settings (template, storage) to generate against.',
        );
      }
      return { path: null, bytes: null };
    }
    const settings = await this.settingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection', 'organization'] });
    if (!settings?.storageConnection) {
      if (throwOnError) throw new BadRequestException('No storage connection is configured in Payment settings.');
      return { path: null, bytes: null };
    }

    try {
      const pdfBytes = await this.renderPdfBytes(payment, settings);
      const { adapter, encryptAtRest } = await this.storageService.getAdapterWithMeta(settings.storageConnection.id);
      const relativePath = `Payments/${payment.paymentNumber ?? payment.id}.pdf`;
      const finalPath = await writeMaybeEncrypted(adapter, relativePath, pdfBytes, encryptAtRest);

      // The very first successful render is "the original" per the
      // business rule that it only ever goes out once, at creation —
      // capture that BEFORE updating it, so the email-send below can
      // tell "this is genuinely the first time" apart from "an admin
      // is just regenerating the stored file later" (e.g. after a
      // template/logo change) without re-emailing the client each time.
      const isFirstIssuance = !payment.originalIssuedAt;
      if (isFirstIssuance) {
        payment.originalIssuedAt = new Date();
        await this.repo.update(payment.id, { originalIssuedAt: payment.originalIssuedAt });
      }

      // Emailing the original is no longer gated by the org's general
      // autoSendEmail toggle — per Israeli law the original may only
      // be issued once, and delivering it to the email given at
      // payment time (see CreatePaymentDto.clientEmail) IS that one
      // issuance, not an optional convenience send like it is for
      // other document types. Only fires on the actual first issuance,
      // never on a later admin-triggered regeneration of the file.
      if (isFirstIssuance && payment.clientEmail) {
        this.documentSendingService
          .sendDocument({
            clientEmail: payment.clientEmail,
            filename: relativePath.split('/').pop()!,
            pdfBuffer: pdfBytes,
            subject: `קבלה ${payment.paymentNumber ?? payment.id}`,
          })
          .catch(() => {});
      }

      return { path: finalPath, bytes: pdfBytes };
    } catch (err) {
      if (throwOnError) throw err;
      return { path: null, bytes: null };
    }
  }

  private methodLabel(method: Payment['method']): string {
    switch (method) {
      case 'cash': return 'מזומן';
      case 'bank_transfer': return 'העברה בנקאית';
      case 'check': return "צ'ק";
      case 'bit': return 'ביט';
      case 'standing_order': return 'הרשאה לחיוב חשבון';
      case 'credit_card':
      default: return 'כרטיס אשראי';
    }
  }

  /** Builds the receipt line-item description, appending whatever
   * method-specific reference detail is meaningful to print (check
   * number, last 4 card digits, transfer reference, etc.) so the
   * receipt itself documents how the payment was made, not just that
   * it was made. */
  private paymentLineDescription(payment: Payment): string {
    const label = this.methodLabel(payment.method);
    switch (payment.method) {
      case 'credit_card': {
        const bits = [payment.cardLast4 ? `····${payment.cardLast4}` : null, payment.installments && payment.installments > 1 ? `${payment.installments} תשלומים` : null].filter(Boolean);
        return bits.length ? `תשלום — ${label} (${bits.join(', ')})` : `תשלום — ${label}`;
      }
      case 'check':
        return payment.checkNumber ? `תשלום — ${label} מס' ${payment.checkNumber}` : `תשלום — ${label}`;
      case 'bank_transfer':
      case 'bit':
      case 'standing_order':
        return payment.referenceNumber ? `תשלום — ${label} (אסמכתא ${payment.referenceNumber})` : `תשלום — ${label}`;
      default:
        return `תשלום — ${label}`;
    }
  }

  async regeneratePdf(id: number, organizationId: number | null): Promise<Payment> {
    const payment = await this.findOne(id, organizationId);
    const { path } = await this.tryGeneratePdf(payment, payment.organization?.id ?? organizationId, true);
    payment.storagePath = path;
    return this.repo.save(payment);
  }

  /** @param asCopy When true, ignores the stored original PDF and
   * renders a fresh copy with the "נאמן למקור" (certified true copy)
   * stamp overlaid instead — an explicit, opt-in action (see the
   * class doc comment on Payment.originalIssuedAt), never automatic. */
  /** Always returns a freshly-rendered "נאמן למקור" (certified true
   * copy) — the plain, unstamped original is only ever available once,
   * as part of the create() response at the moment the payment is
   * recorded (see PaymentsService.create() and
   * PaymentsController.create()). Under Israeli law an original
   * receipt may not be reissued a second time, so there's
   * deliberately no code path here that can return the stored
   * original bytes again after creation — not even for the org's own
   * admin. [asCopy] is kept as a parameter for backward source
   * compatibility with existing callers but no longer changes the
   * behavior; every call is "as copy" now. */
  async getPdfBuffer(id: number, organizationId: number | null, _asCopy = true): Promise<Buffer> {
    const payment = await this.findOne(id, organizationId);
    const settings = await this.settingsRepo.findOne({
      where: { organization: { id: payment.organization?.id } },
      relations: ['storageConnection', 'organization'],
    });
    if (!settings?.storageConnection) throw new NotFoundException('Storage connection is no longer configured');
    return this.renderPdfBytes(payment, settings, 'נאמן למקור');
  }

  async getChainSummaryPdfBuffer(id: number, organizationId: number | null): Promise<Buffer> {
    const payment = await this.findOne(id, organizationId);
    if (!payment.chainSummaryPath) throw new NotFoundException('No chain summary PDF has been generated yet');
    const settings = await this.settingsRepo.findOne({
      where: { organization: { id: payment.organization?.id } },
      relations: ['storageConnection'],
    });
    if (!settings?.storageConnection) throw new NotFoundException('Storage connection is no longer configured');
    const { adapter } = await this.storageService.getAdapterWithMeta(settings.storageConnection.id);
    return readMaybeEncrypted(adapter, payment.chainSummaryPath);
  }

  async remove(id: number, organizationId: number | null): Promise<void> {
    const payment = await this.findOne(id, organizationId);
    await this.repo.remove(payment);
  }
}
