import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Quote, QuoteStatus } from './entities/quote.entity';
import { QuoteSettings } from './entities/quote-settings.entity';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageService } from '../storage/storage.service';
import { generateDocumentPdf } from '../documents/document-pdf.util';
import { DocumentSendingService } from '../document-email/document-sending.service';
import { ExchangeRateService } from '../currency/exchange-rate.service';
import { TemplateDesignService } from '../template-design/template-design.service';
import { writeMaybeEncrypted, readMaybeEncrypted } from '../../common/crypto/encrypted-storage.util';

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(Quote) private readonly repo: Repository<Quote>,
    @InjectRepository(QuoteSettings) private readonly settingsRepo: Repository<QuoteSettings>,
    @InjectRepository(DeliveryNoteSettings) private readonly noteSettingsRepo: Repository<DeliveryNoteSettings>,
    private readonly storageService: StorageService,
    private readonly documentSendingService: DocumentSendingService,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly templateDesignService: TemplateDesignService,
  ) {}

  private computeTotal(items: { quantity: number; unitPrice: number }[]): number {
    return Math.round(items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) * 100) / 100;
  }

  /** "{prefix}{startingNumber + count so far}" once numbering is
   * locked for the org; otherwise just "#{count+1}" (no prefix, starts
   * at 1) — a usable placeholder before an admin has set the real
   * series, since a quote still has to have *some* number. */
  /** Atomically claims the next number for this org (or the global
   * series, for a super-admin with no org) and advances the counter
   * in the same query — two quotes created at the same moment can
   * never end up with the same number, unlike the old COUNT(*)
   * approach this replaced. */
  private async generateQuoteNumber(organizationId: number | null): Promise<string> {
    if (organizationId == null) {
      // No org context (super-admin) — settings/locking don't apply;
      // fall back to a simple running count, same as before.
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

  async findAll(organizationId: number | null): Promise<Quote[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId }, isTemplate: false } : { isTemplate: false },
      order: { createdAt: 'DESC' },
    });
  }

  /** The separate "reusable starting points" list — see the
   * isTemplate doc comment on the entity for why these are excluded
   * from findAll() above. */
  async findTemplates(organizationId: number | null): Promise<Quote[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId }, isTemplate: true } : { isTemplate: true },
      order: { templateNumber: 'ASC' },
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

  /** Converts an already-created quote into a reusable template —
   * see the isTemplate doc comment on the entity for the full
   * rationale. Idempotent on the name (calling again just renames
   * it); assigns a templateNumber only the first time. */
  async saveAsTemplate(id: number, organizationId: number | null, templateName: string): Promise<Quote> {
    const quote = await this.findOne(id, organizationId);
    quote.isTemplate = true;
    quote.templateName = templateName;
    if (quote.templateNumber == null) {
      quote.templateNumber = await this.assignTemplateNumber(organizationId);
    }
    return this.repo.save(quote);
  }

  async unmarkTemplate(id: number, organizationId: number | null): Promise<Quote> {
    const quote = await this.findOne(id, organizationId);
    quote.isTemplate = false;
    return this.repo.save(quote);
  }

  /** Smallest positive integer not already used by another template
   * in this organization — same "reuse a gap" convention as a
   * phonebook contact's clientIdentifier, not just max+1. */
  private async assignTemplateNumber(organizationId: number | null): Promise<number> {
    const rows = await this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId }, isTemplate: true } : { isTemplate: true },
      select: ['templateNumber'],
    });
    const used = new Set(rows.map((r) => r.templateNumber).filter((n): n is number => n != null));
    let candidate = 1;
    while (used.has(candidate)) candidate++;
    return candidate;
  }

  /** Creates a genuine new draft quote by copying a template's
   * client/items/notes/currency/vatCategory — everything a person
   * would otherwise have to type from scratch — while getting its own
   * fresh id, quoteNumber, approvalToken, and chainId (it's a real,
   * independent document from this point on, not still linked to the
   * template it came from). Any field in `overrides` replaces the
   * template's own value, so "replace or add only part of the
   * information" (the stated purpose of this whole feature) is just
   * passing whatever the person actually changed. */
  async createFromTemplate(
    templateId: number,
    organizationId: number | null,
    userId: number,
    overrides: Partial<CreateQuoteDto>,
  ): Promise<Quote> {
    const template = await this.findOne(templateId, organizationId);
    if (!template.isTemplate) throw new BadRequestException('That quote is not a template');

    return this.create(organizationId, userId, {
      clientName: overrides.clientName ?? template.clientName,
      clientEmail: overrides.clientEmail ?? template.clientEmail,
      date: overrides.date,
      items: overrides.items ?? template.items,
      notes: overrides.notes ?? template.notes,
      currency: overrides.currency ?? template.currency,
      exchangeRateToIls: overrides.exchangeRateToIls,
      vatCategory: overrides.vatCategory ?? template.vatCategory,
      chainId: overrides.chainId,
    });
  }

  async create(organizationId: number | null, userId: number, dto: CreateQuoteDto): Promise<Quote> {
    const currency = dto.currency ?? 'ILS';
    const exchangeRateToIls = currency === 'ILS'
      ? 1
      : dto.exchangeRateToIls ?? (await this.exchangeRateService.getRate(currency)) ?? undefined;
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
      currency,
      exchangeRateToIls,
      vatCategory: dto.vatCategory ?? 'standard',
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
      chainId: dto.chainId || crypto.randomUUID(),
    });
    const saved = await this.repo.save(quote);
    saved.storagePath = await this.tryGeneratePdf(saved, organizationId);
    return this.repo.save(saved);
  }

  /** Best-effort: a missing storage connection or a PDF rendering
   * error shouldn't block creating the quote record itself — the
   * document can be regenerated/retried later once settings are
   * fixed. Returns null on any failure (unless throwOnError is set —
   * used by the explicit "Regenerate PDF" action, where silently
   * doing nothing would be confusing; the user should see why it
   * still failed). */
  private async tryGeneratePdf(quote: Quote, organizationId: number | null, throwOnError = false): Promise<string | null> {
    if (organizationId == null) {
      if (throwOnError) {
        throw new BadRequestException(
          'This account isn\'t assigned to an organization, so there\'s no Quote settings (template, storage) to generate against. Sign in as a user assigned to this quote\'s organization instead.',
        );
      }
      return null;
    }
    const settings = await this.settingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection', 'organization'] });
    if (!settings?.storageConnection) {
      if (throwOnError) throw new BadRequestException('No storage connection is configured in Quote settings.');
      return null;
    }

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
        isDemoMode: settings.organization?.isDemoMode ?? false,
        vatEnabled: settings.vatEnabled && quote.vatCategory !== 'exempt',
        vatCategory: quote.vatCategory,
        currency: quote.currency,
        exchangeRateToIls: quote.exchangeRateToIls ?? undefined,
        design: await this.templateDesignService.getConfigForOrg(organizationId),
      });
      const { adapter, encryptAtRest } = await this.storageService.getAdapterWithMeta(settings.storageConnection.id);
      const relativePath = `Quotes/${quote.quoteNumber ?? quote.id}.pdf`;
      const finalPath = await writeMaybeEncrypted(adapter, relativePath, pdfBytes, encryptAtRest);

      if (settings.autoSendEmail) {
        this.documentSendingService
          .sendDocument({
            clientEmail: quote.clientEmail,
            filename: relativePath.split('/').pop()!,
            pdfBuffer: pdfBytes,
            subject: `הצעת מחיר ${quote.quoteNumber ?? quote.id}`,
          })
          .catch(() => {}); // best-effort, doesn't block PDF generation succeeding
      }

      return finalPath;
    } catch (err) {
      if (throwOnError) throw err;
      return null;
    }
  }

  /** Explicit user-triggered retry — e.g. after configuring storage
   * that wasn't set up when the quote was first created, or after
   * switching templates and wanting existing quotes to match. */
  async regeneratePdf(id: number, organizationId: number | null): Promise<Quote> {
    const quote = await this.findOne(id, organizationId);
    // Use the quote's OWN organization for settings/storage lookup —
    // not the calling user's, which is null for a super-admin looking
    // at a specific org's quote. findOne() already enforces that a
    // regular admin can only reach quotes in their own org anyway.
    quote.storagePath = await this.tryGeneratePdf(quote, quote.organization?.id ?? organizationId, true);
    return this.repo.save(quote);
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

  /** Quotes cannot be deleted once created — kept in the permanent
   * record for the same reasoning as every other document type here
   * (see InvoicesService.remove()). If a quote was rejected or is no
   * longer relevant, mark it declined (QuoteStatus.DECLINED) instead
   * of erasing it — that keeps the full sales history intact. */
  async remove(_id: number, _organizationId: number | null): Promise<void> {
    throw new BadRequestException(
      'Quotes cannot be deleted once created — this record needs to stay in the permanent history. Mark it declined instead of erasing it.',
    );
  }

  async getPdfBuffer(id: number, organizationId: number | null): Promise<Buffer> {
    const quote = await this.findOne(id, organizationId);
    if (!quote.storagePath) throw new NotFoundException('No PDF has been generated for this quote yet');
    const settings = await this.settingsRepo.findOne({
      where: { organization: { id: quote.organization?.id } },
      relations: ['storageConnection'],
    });
    if (!settings?.storageConnection) throw new NotFoundException('Storage connection is no longer configured');
    const { adapter } = await this.storageService.getAdapterWithMeta(settings.storageConnection.id);
    return readMaybeEncrypted(adapter, quote.storagePath);
  }
}
