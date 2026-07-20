import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { InvoiceSettings } from './entities/invoice-settings.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageService } from '../storage/storage.service';
import { generateDocumentPdf } from '../documents/document-pdf.util';

@Injectable()
export class InvoicesService {
  constructor(
    @InjectRepository(Invoice) private readonly repo: Repository<Invoice>,
    @InjectRepository(InvoiceSettings) private readonly settingsRepo: Repository<InvoiceSettings>,
    @InjectRepository(DeliveryNoteSettings) private readonly noteSettingsRepo: Repository<DeliveryNoteSettings>,
    private readonly storageService: StorageService,
  ) {}

  private computeTotal(items: { quantity: number; unitPrice: number }[]): number {
    return Math.round(items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) * 100) / 100;
  }

  /** "{prefix}{startingNumber + count so far}" once numbering is
   * locked for the org (see entity doc comment on why this is
   * deliberately not compliance-grade sequential numbering);
   * otherwise a plain "#{count+1}" placeholder. */
  private async generateInvoiceNumber(organizationId: number | null): Promise<string> {
    const orgWhere = organizationId != null ? { organization: { id: organizationId } } : {};
    const count = await this.repo.count({ where: orgWhere });
    const settings = organizationId != null
      ? await this.settingsRepo.findOne({ where: { organization: { id: organizationId } } })
      : null;
    if (settings?.numberLocked && settings.startingNumber != null) {
      return `${settings.numberPrefix ?? ''}${settings.startingNumber + count}`;
    }
    return `#${count + 1}`;
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
    const invoice = this.repo.create({
      invoiceNumber: await this.generateInvoiceNumber(organizationId),
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      date: dto.date ?? new Date().toISOString().slice(0, 10),
      items: dto.items,
      total: this.computeTotal(dto.items),
      notes: dto.notes,
      status: InvoiceStatus.DRAFT,
      quoteId: dto.quoteId,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    const saved = await this.repo.save(invoice);
    saved.storagePath = await this.tryGeneratePdf(saved, organizationId);
    return this.repo.save(saved);
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
    const settings = await this.settingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection'] });
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
      });
      const adapter = await this.storageService.getAdapter(settings.storageConnection.id);
      const relativePath = `Invoices/${invoice.invoiceNumber ?? invoice.id}.pdf`;
      await adapter.write(relativePath, pdfBytes);
      return relativePath;
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
    const adapter = await this.storageService.getAdapter(settings.storageConnection.id);
    return adapter.read(invoice.storagePath);
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

  async remove(id: number, organizationId: number | null): Promise<void> {
    const invoice = await this.findOne(id, organizationId);
    await this.repo.remove(invoice);
  }
}
