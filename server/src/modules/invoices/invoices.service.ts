import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { InvoiceSettings } from './entities/invoice-settings.entity';
import { LedgerPostingService } from '../accounting/ledger-posting.service';
import { TaxAuthorityAllocationService } from '../invoice-israel/tax-authority-allocation.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageService } from '../storage/storage.service';
import { generateDocumentPdf, VAT_RATE } from '../documents/document-pdf.util';
import { DocumentSendingService } from '../document-email/document-sending.service';
import { writeMaybeEncrypted, readMaybeEncrypted } from '../../common/crypto/encrypted-storage.util';
import { Quote } from '../quotes/entities/quote.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice) private readonly repo: Repository<Invoice>,
    @InjectRepository(InvoiceSettings) private readonly settingsRepo: Repository<InvoiceSettings>,
    @InjectRepository(DeliveryNoteSettings) private readonly noteSettingsRepo: Repository<DeliveryNoteSettings>,
    @InjectRepository(Quote) private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(DeliveryNote) private readonly deliveryNotesRepo: Repository<DeliveryNote>,
    private readonly storageService: StorageService,
    private readonly documentSendingService: DocumentSendingService,
    private readonly ledgerPostingService: LedgerPostingService,
    private readonly taxAuthorityAllocationService: TaxAuthorityAllocationService,
  ) {}

  private computeTotal(items: { quantity: number; unitPrice: number }[]): number {
    return Math.round(items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) * 100) / 100;
  }

  /** "{prefix}{startingNumber + count so far}" once numbering is
   * locked for the org (see entity doc comment on why this is
   * deliberately not compliance-grade sequential numbering);
   * otherwise a plain "#{count+1}" placeholder. */
  /** See QuotesService.generateQuoteNumber — same fix, same reasoning. */
  private async generateInvoiceNumber(organizationId: number | null): Promise<string> {
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

  async findAll(organizationId: number | null): Promise<Invoice[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, organizationId: number | null): Promise<Invoice> {
    const invoice = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (organizationId != null && invoice.organization?.id !== organizationId) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async create(organizationId: number | null, userId: number, dto: CreateInvoiceDto): Promise<Invoice> {
    const chainId = await this.resolveChainIdForCreate(dto.quoteId, dto.deliveryNoteId, dto.chainId, organizationId);
    const invoice = this.repo.create({
      invoiceNumber: await this.generateInvoiceNumber(organizationId),
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      clientTaxId: dto.clientTaxId,
      date: dto.date ?? new Date().toISOString().slice(0, 10),
      items: dto.items,
      total: this.computeTotal(dto.items),
      notes: dto.notes,
      status: InvoiceStatus.DRAFT,
      quoteId: dto.quoteId,
      deliveryNoteId: dto.deliveryNoteId,
      chainId,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    const saved = await this.repo.save(invoice);
    saved.storagePath = await this.tryGeneratePdf(saved, organizationId);
    const result = await this.repo.save(saved);

    let vatEnabledForAllocation = true;
    if (organizationId != null) {
      try {
        const settings = await this.settingsRepo.findOne({ where: { organization: { id: organizationId } } });
        const vatEnabled = settings?.vatEnabled ?? true;
        vatEnabledForAllocation = vatEnabled;
        const vatAmount = vatEnabled ? Math.round(result.total * VAT_RATE * 100) / 100 : 0;
        await this.ledgerPostingService.postInvoice(organizationId, result.id, result.date ?? new Date().toISOString().slice(0, 10), result.total, vatAmount, result.clientName);
      } catch {
        // Ledger posting is best-effort — a bookkeeping hiccup must
        // never block issuing the invoice itself.
      }

      // requirement #6 ("Invoice Israel") — best-effort, never blocks
      // issuing the invoice. maybeRequestAllocation() itself decides
      // whether this invoice is even eligible (threshold/VAT/
      // clientTaxId) and whether the integration is turned on at all.
      await this.taxAuthorityAllocationService.maybeRequestAllocation(result, organizationId, vatEnabledForAllocation);

      // The PDF above was already generated and stored WITHOUT the
      // allocation number, since that request only just happened —
      // reprint it now that result.allocationNumber may be set, so
      // the stored/emailed PDF actually carries the number rather
      // than requiring a separate manual "regenerate" action.
      if (result.allocationNumber) {
        result.storagePath = await this.tryGeneratePdf(result, organizationId);
        await this.repo.save(result);
      }
    }

    return result;
  }

  /** Joins the chain of a linked quote or delivery note (quoteId takes
   * priority if somehow both are set), back-filling that document with
   * a fresh chainId first if it never had one. Falls back to an
   * explicit dto.chainId, then to a brand new chain. */
  private async resolveChainIdForCreate(quoteId: number | undefined, deliveryNoteId: number | undefined, explicitChainId: string | undefined, _organizationId: number | null): Promise<string> {
    if (quoteId) {
      const quote = await this.quotesRepo.findOne({ where: { id: quoteId } });
      if (quote) {
        if (!quote.chainId) {
          quote.chainId = crypto.randomUUID();
          await this.quotesRepo.save(quote);
        }
        return quote.chainId;
      }
    }
    if (deliveryNoteId) {
      const note = await this.deliveryNotesRepo.findOne({ where: { id: deliveryNoteId } });
      if (note) {
        if (!note.chainId) {
          note.chainId = crypto.randomUUID();
          await this.deliveryNotesRepo.save(note);
        }
        return note.chainId;
      }
    }
    return explicitChainId || crypto.randomUUID();
  }

  private async tryGeneratePdf(invoice: Invoice, organizationId: number | null, throwOnError = false): Promise<string | null> {
    if (organizationId == null) {
      if (throwOnError) {
        throw new BadRequestException(
          'This account isn\'t assigned to an organization, so there\'s no Invoice settings (template, storage) to generate against. Sign in as a user assigned to this invoice\'s organization instead.',
        );
      }
      return null;
    }
    const settings = await this.settingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection', 'organization'] });
    if (!settings?.storageConnection) {
      if (throwOnError) throw new BadRequestException('No storage connection is configured in Invoice settings.');
      return null;
    }

    try {
      const header = (await this.noteSettingsRepo.findOne({ where: { organization: { id: organizationId } } })) ?? {};
      const pdfBytes = await generateDocumentPdf({
        docTypeLabel: 'חשבונית',
        docNumber: invoice.invoiceNumber ?? `#${invoice.id}`,
        date: invoice.date ?? new Date().toISOString().slice(0, 10),
        clientName: invoice.clientName,
        clientEmail: invoice.clientEmail,
        items: invoice.items,
        total: invoice.total,
        footerText: settings.footerText,
        header,
        template: (settings.template as any) ?? 'classic',
        isDemoMode: settings.organization?.isDemoMode ?? false,
        vatEnabled: settings.vatEnabled,
        allocationNumber: invoice.allocationNumber,
        continuedWithoutAllocation: invoice.allocationDecision === 'continue',
      });
      const { adapter, encryptAtRest } = await this.storageService.getAdapterWithMeta(settings.storageConnection.id);
      const relativePath = `Invoices/${invoice.invoiceNumber ?? invoice.id}.pdf`;
      const finalPath = await writeMaybeEncrypted(adapter, relativePath, pdfBytes, encryptAtRest);

      if (settings.autoSendEmail) {
        this.documentSendingService
          .sendDocument({
            clientEmail: invoice.clientEmail,
            filename: relativePath.split('/').pop()!,
            pdfBuffer: pdfBytes,
            subject: `חשבונית ${invoice.invoiceNumber ?? invoice.id}`,
          })
          .catch(() => {});
      }

      return finalPath;
    } catch (err) {
      if (throwOnError) throw err;
      return null;
    }
  }

  async regeneratePdf(id: number, organizationId: number | null): Promise<Invoice> {
    const invoice = await this.findOne(id, organizationId);
    invoice.storagePath = await this.tryGeneratePdf(invoice, invoice.organization?.id ?? organizationId, true);
    return this.repo.save(invoice);
  }

  async getPdfBuffer(id: number, organizationId: number | null): Promise<Buffer> {
    const invoice = await this.findOne(id, organizationId);
    if (!invoice.storagePath) throw new NotFoundException('No PDF has been generated for this invoice yet');
    const settings = await this.settingsRepo.findOne({
      where: { organization: { id: invoice.organization?.id } },
      relations: ['storageConnection'],
    });
    if (!settings?.storageConnection) throw new NotFoundException('Storage connection is no longer configured');
    const { adapter } = await this.storageService.getAdapterWithMeta(settings.storageConnection.id);
    return readMaybeEncrypted(adapter, invoice.storagePath);
  }

  async markSent(id: number, organizationId: number | null): Promise<Invoice> {
    const invoice = await this.findOne(id, organizationId);
    invoice.status = InvoiceStatus.SENT;
    return this.repo.save(invoice);
  }

  /** Manual "mark as paid" — no payment gateway wired in. See entity doc comment. */
  async markPaid(id: number, organizationId: number | null): Promise<Invoice> {
    const invoice = await this.findOne(id, organizationId);
    invoice.status = InvoiceStatus.PAID;
    invoice.paidAt = new Date();
    return this.repo.save(invoice);
  }

  async submitAllocationDecision(id: number, organizationId: number | null, decision: 'cancel' | 'continue' | 'furtherObjection'): Promise<Invoice> {
    const invoice = await this.findOne(id, organizationId);
    if (organizationId == null) throw new BadRequestException('No organization context.');
    if (invoice.allocationStatus !== 'refused') throw new BadRequestException('This invoice has no refused allocation request to decide on.');
    await this.taxAuthorityAllocationService.submitDecision(invoice, organizationId, decision);
    if (decision === 'continue') {
      // Per the spec: an invoice that continues without an allocation
      // number must prominently state that input VAT can't be
      // deducted for it — folded into footerText the same way the
      // allocation number itself is, rather than new template code.
      invoice.storagePath = await this.tryGeneratePdf(invoice, organizationId);
      await this.repo.save(invoice);
    }
    return invoice;
  }

  /** Deliberately does NOT delete — an invoice is a fiscal document
   * (חשבונית מס) and gets its number the moment it's created (there is
   * no draft state in this system, see generateInvoiceNumber). Israeli
   * tax law requires that once issued, a document can never be deleted
   * or have its amount/VAT changed - the only correction mechanism is
   * a credit note (זיכוי) referencing it, which is its own numbered
   * document, not an edit or removal of this one. See CreditNotesModule. */
  async remove(_id: number, _organizationId: number | null): Promise<void> {
    throw new BadRequestException(
      'Invoices cannot be deleted once issued — Israeli tax law requires a credit note (זיכוי) to correct or void one instead. Use POST /credit-notes.',
    );
  }
}
