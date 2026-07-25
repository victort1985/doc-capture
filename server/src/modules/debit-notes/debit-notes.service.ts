import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DebitNote } from './entities/debit-note.entity';
import { DebitNoteSettings } from './entities/debit-note-settings.entity';
import { CreateDebitNoteDto } from './dto/create-debit-note.dto';
import { Invoice } from '../invoices/entities/invoice.entity';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageService } from '../storage/storage.service';
import { generateDocumentPdf } from '../documents/document-pdf.util';
import { DocumentSendingService } from '../document-email/document-sending.service';

@Injectable()
export class DebitNotesService {
  constructor(
    @InjectRepository(DebitNote) private readonly repo: Repository<DebitNote>,
    @InjectRepository(DebitNoteSettings) private readonly settingsRepo: Repository<DebitNoteSettings>,
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(DeliveryNoteSettings) private readonly noteSettingsRepo: Repository<DeliveryNoteSettings>,
    private readonly storageService: StorageService,
    private readonly documentSendingService: DocumentSendingService,
  ) {}

  private async generateDebitNoteNumber(organizationId: number | null): Promise<string> {
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

  async findAll(organizationId: number | null): Promise<DebitNote[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, organizationId: number | null): Promise<DebitNote> {
    const note = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!note) throw new NotFoundException('Debit note not found');
    if (organizationId != null && note.organization?.id !== organizationId) {
      throw new NotFoundException('Debit note not found');
    }
    return note;
  }

  async create(organizationId: number | null, userId: number, dto: CreateDebitNoteDto): Promise<DebitNote> {
    const invoice = await this.invoicesRepo.findOne({ where: { id: dto.invoiceId } });
    if (!invoice) throw new NotFoundException('The invoice this debit note relates to was not found.');
    if (organizationId != null && invoice.organization?.id !== organizationId) {
      throw new NotFoundException('The invoice this debit note relates to was not found.');
    }

    const total = dto.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

    const debitNote = this.repo.create({
      debitNoteNumber: await this.generateDebitNoteNumber(organizationId),
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
    const saved = await this.repo.save(debitNote);
    saved.storagePath = await this.tryGeneratePdf(saved, organizationId);
    return this.repo.save(saved);
  }

  private async tryGeneratePdf(debitNote: DebitNote, organizationId: number | null): Promise<string | null> {
    if (organizationId == null) return null;
    const settings = await this.settingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection', 'organization'] });
    if (!settings?.storageConnection) return null;

    try {
      const header = (await this.noteSettingsRepo.findOne({ where: { organization: { id: organizationId } } })) ?? {};
      const pdfBytes = await generateDocumentPdf({
        docTypeLabel: 'הודעת חיוב',
        docNumber: debitNote.debitNoteNumber ?? `#${debitNote.id}`,
        date: debitNote.date ?? new Date().toISOString().slice(0, 10),
        clientName: debitNote.clientName,
        clientEmail: debitNote.clientEmail,
        items: debitNote.items,
        total: debitNote.total,
        footerText: `${debitNote.reason}${settings.footerText ? `\n${settings.footerText}` : ''}`,
        header,
        template: (settings.template as any) ?? 'classic',
        isDemoMode: settings.organization?.isDemoMode ?? false,
      });
      const adapter = await this.storageService.getAdapter(settings.storageConnection.id);
      const relativePath = `DebitNotes/${debitNote.debitNoteNumber ?? debitNote.id}.pdf`;
      await adapter.write(relativePath, pdfBytes);

      if (settings.autoSendEmail) {
        this.documentSendingService
          .sendDocument({
            clientEmail: debitNote.clientEmail,
            filename: relativePath.split('/').pop()!,
            pdfBuffer: pdfBytes,
            subject: `הודעת חיוב ${debitNote.debitNoteNumber ?? debitNote.id}`,
          })
          .catch(() => {});
      }
      return relativePath;
    } catch {
      return null;
    }
  }

  async getPdfBuffer(id: number, organizationId: number | null): Promise<Buffer> {
    const debitNote = await this.findOne(id, organizationId);
    if (!debitNote.storagePath) throw new NotFoundException('No PDF has been generated for this debit note yet');
    const settings = await this.settingsRepo.findOne({
      where: { organization: { id: debitNote.organization?.id } },
      relations: ['storageConnection'],
    });
    if (!settings?.storageConnection) throw new NotFoundException('Storage connection is no longer configured');
    const adapter = await this.storageService.getAdapter(settings.storageConnection.id);
    return adapter.read(debitNote.storagePath);
  }
}
