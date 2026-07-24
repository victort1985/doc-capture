import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Quote } from '../quotes/entities/quote.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { Order } from '../orders/entities/order.entity';
import { Payment } from '../payments/entities/payment.entity';

export type ChainDocType = 'quote' | 'order' | 'delivery-note' | 'invoice' | 'payment';

export interface ChainResult {
  chainId: string;
  quotes: Quote[];
  orders: Order[];
  deliveryNotes: DeliveryNote[];
  invoices: Invoice[];
  payments: Payment[];
  status: {
    hasQuote: boolean;
    hasOrder: boolean;
    hasDeliveryNote: boolean;
    deliveryNoteSigned: boolean;
    hasInvoice: boolean;
    hasPayment: boolean;
    complete: boolean;
  };
}

@Injectable()
export class OrderChainService {
  constructor(
    @InjectRepository(Quote) private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    @InjectRepository(DeliveryNote) private readonly deliveryNotesRepo: Repository<DeliveryNote>,
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(Payment) private readonly paymentsRepo: Repository<Payment>,
  ) {}

  /** Resolves the chainId for a given document — if it doesn't have
   * one yet, assigns it a fresh one on the spot rather than failing,
   * so every document is always chain-viewable. */
  async resolveChainId(docType: ChainDocType, id: number, organizationId: number | null): Promise<string> {
    const { repo, where } = this.repoFor(docType, id, organizationId);
    const doc = await repo.findOne({ where });
    if (!doc) throw new NotFoundException('Document not found');
    if (!(doc as any).chainId) {
      (doc as any).chainId = crypto.randomUUID();
      await repo.save(doc);
    }
    return (doc as any).chainId;
  }

  async getChain(chainId: string, organizationId: number | null): Promise<ChainResult> {
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};
    const [quotes, orders, deliveryNotes, invoices, payments] = await Promise.all([
      this.quotesRepo.find({ where: { chainId, ...orgFilter }, order: { createdAt: 'ASC' } }),
      this.ordersRepo.find({ where: { chainId } as any, order: { createdAt: 'ASC' } }),
      this.deliveryNotesRepo.find({ where: { chainId, ...orgFilter }, order: { createdAt: 'ASC' } }),
      this.invoicesRepo.find({ where: { chainId, ...orgFilter }, order: { createdAt: 'ASC' } }),
      this.paymentsRepo.find({ where: { chainId, ...orgFilter }, order: { createdAt: 'ASC' } }),
    ]);

    const signedNote = deliveryNotes.find((n: any) => !!n.lesseeSignedAt || n.status === 'signed');

    return {
      chainId,
      quotes, orders, deliveryNotes, invoices, payments,
      status: {
        hasQuote: quotes.length > 0,
        hasOrder: orders.length > 0,
        hasDeliveryNote: deliveryNotes.length > 0,
        deliveryNoteSigned: !!signedNote,
        hasInvoice: invoices.length > 0,
        hasPayment: payments.length > 0,
        complete: payments.length > 0,
      },
    };
  }

  async getChainForDocument(docType: ChainDocType, id: number, organizationId: number | null): Promise<ChainResult> {
    const chainId = await this.resolveChainId(docType, id, organizationId);
    return this.getChain(chainId, organizationId);
  }

  /** Resolves just the status summary for a batch of documents in one
   * round-trip — built for list screens (quotes/orders/delivery-notes/
   * invoices/payments) that want a status badge on every row without
   * firing one request per row. Documents that don't have a chainId
   * yet are reported with an all-false status rather than assigned a
   * fresh one here — resolving/assigning happens lazily the first time
   * someone actually opens that document's own chain view, not just
   * from glancing at a list. */
  async getStatusBatch(
    requests: { docType: ChainDocType; id: number }[],
    organizationId: number | null,
  ): Promise<Record<string, ChainResult['status']>> {
    const emptyStatus: ChainResult['status'] = {
      hasQuote: false, hasOrder: false, hasDeliveryNote: false,
      deliveryNoteSigned: false, hasInvoice: false, hasPayment: false, complete: false,
    };

    // Look up each document's chainId (without assigning a new one for
    // documents that don't have one yet) in parallel, then fetch each
    // distinct chain's full status once, even if several requested
    // documents happen to share the same chain.
    const chainIds = await Promise.all(
      requests.map(async (r) => {
        const { repo, where } = this.repoFor(r.docType, r.id, organizationId);
        const doc = await repo.findOne({ where });
        return (doc as any)?.chainId as string | undefined;
      }),
    );

    const uniqueChainIds = [...new Set(chainIds.filter((id): id is string => !!id))];
    const chains = await Promise.all(uniqueChainIds.map((id) => this.getChain(id, organizationId)));
    const statusByChainId = new Map(chains.map((c) => [c.chainId, c.status]));

    const result: Record<string, ChainResult['status']> = {};
    requests.forEach((r, i) => {
      const key = `${r.docType}:${r.id}`;
      const chainId = chainIds[i];
      result[key] = (chainId && statusByChainId.get(chainId)) || emptyStatus;
    });
    return result;
  }

  /** Manually attaches an existing document to another document's
   * chain — e.g. linking an already-received Order to a Quote created
   * separately, rather than only supporting "create a new X from this
   * Y" at creation time. Both end up sharing the SAME chainId; if the
   * source document already had its own chain with other documents in
   * it, those get folded in too (repointed to match) rather than
   * silently orphaned — a deliberate merge, not a move. */
  async linkDocuments(
    sourceType: ChainDocType, sourceId: number,
    targetType: ChainDocType, targetId: number,
    organizationId: number | null,
  ): Promise<ChainResult> {
    const targetChainId = await this.resolveChainId(targetType, targetId, organizationId);
    const { repo: sourceRepo, where: sourceWhere } = this.repoFor(sourceType, sourceId, organizationId);
    const sourceDoc = await sourceRepo.findOne({ where: sourceWhere });
    if (!sourceDoc) throw new NotFoundException('Document not found');

    const sourceChainId = (sourceDoc as any).chainId;
    if (sourceChainId && sourceChainId !== targetChainId) {
      await Promise.all(
        [this.quotesRepo, this.ordersRepo, this.deliveryNotesRepo, this.invoicesRepo, this.paymentsRepo].map((repo) =>
          repo.update({ chainId: sourceChainId } as any, { chainId: targetChainId } as any),
        ),
      );
    } else {
      (sourceDoc as any).chainId = targetChainId;
      await sourceRepo.save(sourceDoc);
    }

    return this.getChain(targetChainId, organizationId);
  }

  private repoFor(docType: ChainDocType, id: number, organizationId: number | null) {
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};
    switch (docType) {
      case 'quote': return { repo: this.quotesRepo as Repository<any>, where: { id, ...orgFilter } };
      case 'order': return { repo: this.ordersRepo as Repository<any>, where: { id } };
      case 'delivery-note': return { repo: this.deliveryNotesRepo as Repository<any>, where: { id, ...orgFilter } };
      case 'invoice': return { repo: this.invoicesRepo as Repository<any>, where: { id, ...orgFilter } };
      case 'payment': return { repo: this.paymentsRepo as Repository<any>, where: { id, ...orgFilter } };
    }
  }
}
