import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote, QuoteStatus } from './entities/quote.entity';
import { QuoteSettings } from './entities/quote-settings.entity';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageService } from '../storage/storage.service';
import { generateDocumentPdf } from '../documents/document-pdf.util';

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(Quote) private readonly repo: Repository<Quote>,
    @InjectRepository(QuoteSettings) private readonly settingsRepo: Repository<QuoteSettings>,
    @InjectRepository(DeliveryNoteSettings) private readonly noteSettingsRepo: Repository<DeliveryNoteSettings>,
    private readonly storageService: StorageService,
  ) {}

  private computeTotal(items: { quantity: number; unitPrice: number }[]): number {
    return Math.round(items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) * 100) / 100;
  }

  /** "{prefix}{startingNumber + count so far}" once numbering is
   * locked for the org; otherwise just "#{count+1}" (no prefix, starts
   * at 1) — a usable placeholder before an admin has set the real
   * series, since a quote still has to have *some* number. */
  private async generateQuoteNumber(organizationId: number | null): Promise<string> {
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

  async findAll(organizationId: number | null): Promise<Quote[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, organizationId: number | null): Promise<Quote> {
    const quote = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!quote) throw new NotFoundException('Quote not found');
    if (organizationId != null && quote.organization?.id !== organizationId) {
      throw new NotFoundException('Quote not found');
    }
    return quote;
  }

  /** Client-facing lookup by the unguessable approval token — no auth,
   * no organization scoping (the token itself is the credential). */
  async findByToken(token: string): Promise<Quote> {
    const quote = await this.repo.findOne({ where: { approvalToken: token } });
    if (!quote) throw new NotFoundException('Quote not found');
    return quote;
  }

  async create(organizationId: number | null, userId: number, dto: CreateQuoteDto): Promise<Quote> {
    const quote = this.repo.create({
      quoteNumber: await this.generateQuoteNumber(organizationId),
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      date: dto.date,
      items: dto.items,
      total: this.computeTotal(dto.items),
      notes: dto.notes,
      status: QuoteStatus.DRAFT,
      approvalToken: Quote.generateToken(),
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    const saved = await this.repo.save(quote);
    saved.storagePath = await this.tryGeneratePdf(saved, organizationId);
    return this.repo.save(saved);
  }

  /** Best-effort: a missing storage connection or a PDF rendering
   * error shouldn't block creating the quote record itself — the
   * document can be regenerated/retried later once settings are
   * fixed. Returns null on any failure. */
  private async tryGeneratePdf(quote: Quote, organizationId: number | null): Promise<string | null> {
    if (organizationId == null) return null;
    const settings = await this.settingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection'] });
    if (!settings?.storageConnection) return null;

    try {
      const header = (await this.noteSettingsRepo.findOne({ where: { organization: { id: organizationId } } })) ?? {};
      const pdfBytes = await generateDocumentPdf({
        docTypeLabel: 'הצעת מחיר',
        docNumber: quote.quoteNumber ?? `#${quote.id}`,
        date: quote.date ?? new Date().toISOString().slice(0, 10),
        clientName: quote.clientName,
        clientEmail: quote.clientEmail,
        items: quote.items,
        total: quote.total,
        footerText: settings.footerText,
        header,
        template: (settings.template as any) ?? 'classic',
      });
      const adapter = await this.storageService.getAdapter(settings.storageConnection.id);
      const relativePath = `Quotes/${quote.quoteNumber ?? quote.id}.pdf`;
      await adapter.write(relativePath, pdfBytes);
      return relativePath;
    } catch {
      return null;
    }
  }

  async markSent(id: number, organizationId: number | null): Promise<Quote> {
    const quote = await this.findOne(id, organizationId);
    quote.status = QuoteStatus.SENT;
    return this.repo.save(quote);
  }

  /** Client's own response via the public token — not gated by any
   * office.* permission, since the client isn't a logged-in user. */
  async respond(token: string, approve: boolean): Promise<Quote> {
    const quote = await this.findByToken(token);
    if (quote.status !== QuoteStatus.SENT && quote.status !== QuoteStatus.DRAFT) {
      return quote; // already responded — idempotent, don't flip it back
    }
    quote.status = approve ? QuoteStatus.APPROVED : QuoteStatus.DECLINED;
    quote.respondedAt = new Date();
    return this.repo.save(quote);
  }

  async remove(id: number, organizationId: number | null): Promise<void> {
    const quote = await this.findOne(id, organizationId);
    await this.repo.remove(quote);
  }

  async getPdfBuffer(id: number, organizationId: number | null): Promise<Buffer> {
    const quote = await this.findOne(id, organizationId);
    if (!quote.storagePath) throw new NotFoundException('No PDF has been generated for this quote yet');
    const settings = await this.settingsRepo.findOne({
      where: { organization: { id: quote.organization?.id } },
      relations: ['storageConnection'],
    });
    if (!settings?.storageConnection) throw new NotFoundException('Storage connection is no longer configured');
    const adapter = await this.storageService.getAdapter(settings.storageConnection.id);
    return adapter.read(quote.storagePath);
  }
}
