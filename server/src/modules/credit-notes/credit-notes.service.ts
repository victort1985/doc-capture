import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreditNote } from './entities/credit-note.entity';
import { CreditNoteSettings } from './entities/credit-note-settings.entity';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceSettings } from '../invoices/entities/invoice-settings.entity';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageService } from '../storage/storage.service';
import { generateDocumentPdf } from '../documents/document-pdf.util';
import { DocumentSendingService } from '../document-email/document-sending.service';
import { writeMaybeEncrypted, readMaybeEncrypted } from '../../common/crypto/encrypted-storage.util';
import { LedgerPostingService } from '../accounting/ledger-posting.service';

@Injectable()
export class CreditNotesService {
  constructor(
    @InjectRepository(CreditNote) private readonly repo: Repository<CreditNote>,
    @InjectRepository(CreditNoteSettings) private readonly settingsRepo: Repository<CreditNoteSettings>,
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(InvoiceSettings) private readonly invoiceSettingsRepo: Repository<InvoiceSettings>,
    @InjectRepository(DeliveryNoteSettings) private readonly noteSettingsRepo: Repository<DeliveryNoteSettings>,
    private readonly storageService: StorageService,
    private readonly documentSendingService: DocumentSendingService,
    private readonly ledgerPostingService: LedgerPostingService,
  ) {}

  private async generateCreditNoteNumber(organizationId: number | null): Promise<string> {
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

  async findAll(organizationId: number | null): Promise<CreditNote[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, organizationId: number | null): Promise<CreditNote> {
    const note = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!note) throw new NotFoundException('Credit note not found');
    if (organizationId != null && note.organization?.id !== organizationId) {
      throw new NotFoundException('Credit note not found');
    }
    return note;
  }

  async create(organizationId: number | null, userId: number, dto: CreateCreditNoteDto): Promise<CreditNote> {
    const invoice = await this.invoicesRepo.findOne({ where: { id: dto.invoiceId } });
    if (!invoice) throw new NotFoundException('The invoice this credit note corrects was not found.');
    if (organizationId != null && invoice.organization?.id !== organizationId) {
      throw new NotFoundException('The invoice this credit note corrects was not found.');
    }

    const total = dto.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    if (total > Number(invoice.total) + 0.01) {
      throw new BadRequestException(
        `Credit note total (₪${total.toFixed(2)}) cannot exceed the original invoice's total (₪${Number(invoice.total).toFixed(2)}).`,
      );
    }

    const creditNote = this.repo.create({
      creditNoteNumber: await this.generateCreditNoteNumber(organizationId),
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      date: dto.date ?? new Date().toISOString().slice(0, 10),
      reason: dto.reason,
      items: dto.items,
      total,
      invoiceId: dto.invoiceId,
      chainId: invoice.chainId,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    const saved = await this.repo.save(creditNote);
    saved.storagePath = await this.tryGeneratePdf(saved, organizationId);
    const result = await this.repo.save(saved);

    if (organizationId != null) {
      try {
        const invoiceSettings = await this.invoiceSettingsRepo.findOne({ where: { organization: { id: organizationId } } });
        await this.ledgerPostingService.postCreditNote(organizationId, result.id, result.date ?? new Date().toISOString().slice(0, 10), result.total, result.clientName, invoiceSettings?.vatEnabled ?? true);
      } catch {
        // best-effort — a bookkeeping hiccup must never block issuing the credit note itself
      }
    }

    return result;
  }

  private async tryGeneratePdf(creditNote: CreditNote, organizationId: number | null): Promise<string | null> {
    if (organizationId == null) return null;
    const settings = await this.settingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection', 'organization'] });
    if (!settings?.storageConnection) return null;

    try {
      const header = (await this.noteSettingsRepo.findOne({ where: { organization: { id: organizationId } } })) ?? {};
      // Credit notes don't have their own VAT setting — they follow
      // whatever the org's invoices do, since a credit note is always
      // correcting an invoice and should show VAT consistently with
      // however that invoice's total was originally taxed.
      const invoiceSettings = await this.invoiceSettingsRepo.findOne({ where: { organization: { id: organizationId } } });
      const pdfBytes = await generateDocumentPdf({
        docTypeLabel: 'הודעת זיכוי',
        docNumber: creditNote.creditNoteNumber ?? `#${creditNote.id}`,
        date: creditNote.date ?? new Date().toISOString().slice(0, 10),
        clientName: creditNote.clientName,
        clientEmail: creditNote.clientEmail,
        items: creditNote.items,
        total: creditNote.total,
        footerText: `${creditNote.reason}${settings.footerText ? `\n${settings.footerText}` : ''}`,
        header,
        template: (settings.template as any) ?? 'classic',
        isDemoMode: settings.organization?.isDemoMode ?? false,
        vatEnabled: invoiceSettings?.vatEnabled ?? true,
      });
      const { adapter, encryptAtRest } = await this.storageService.getAdapterWithMeta(settings.storageConnection.id);
      const relativePath = `CreditNotes/${creditNote.creditNoteNumber ?? creditNote.id}.pdf`;
      const finalPath = await writeMaybeEncrypted(adapter, relativePath, pdfBytes, encryptAtRest);

      if (settings.autoSendEmail) {
        this.documentSendingService
          .sendDocument({
            clientEmail: creditNote.clientEmail,
            filename: relativePath.split('/').pop()!,
            pdfBuffer: pdfBytes,
            subject: `הודעת זיכוי ${creditNote.creditNoteNumber ?? creditNote.id}`,
          })
          .catch(() => {});
      }
      return finalPath;
    } catch {
      return null;
    }
  }

  async getPdfBuffer(id: number, organizationId: number | null): Promise<Buffer> {
    const creditNote = await this.findOne(id, organizationId);
    if (!creditNote.storagePath) throw new NotFoundException('No PDF has been generated for this credit note yet');
    const settings = await this.settingsRepo.findOne({
      where: { organization: { id: creditNote.organization?.id } },
      relations: ['storageConnection'],
    });
    if (!settings?.storageConnection) throw new NotFoundException('Storage connection is no longer configured');
    const { adapter } = await this.storageService.getAdapterWithMeta(settings.storageConnection.id);
    return readMaybeEncrypted(adapter, creditNote.storagePath);
  }

  /** Deliberately no remove() — a credit note is itself a fiscal
   * document once issued, subject to the exact same "never delete"
   * rule as the invoice it corrects. If a credit note itself was
   * wrong, the fix is a NEW credit note explaining that, not deleting
   * the mistaken one — the paper trail is the point. */
}
