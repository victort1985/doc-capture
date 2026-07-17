import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote, QuoteStatus } from './entities/quote.entity';
import { QuoteSettings } from './entities/quote-settings.entity';
import { CreateQuoteDto } from './dto/create-quote.dto';

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(Quote) private readonly repo: Repository<Quote>,
    @InjectRepository(QuoteSettings) private readonly settingsRepo: Repository<QuoteSettings>,
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

  async remove(id: number, organizationId: number | null): Promise<void> {
    const quote = await this.findOne(id, organizationId);
    await this.repo.remove(quote);
  }
}
