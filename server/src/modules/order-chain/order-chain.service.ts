import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Quote } from '../quotes/entities/quote.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { Order } from '../orders/entities/order.entity';

export type ChainDocType = 'quote' | 'order' | 'delivery-note' | 'invoice';

export interface ChainResult {
  chainId: string;
  quotes: Quote[];
  orders: Order[];
  deliveryNotes: DeliveryNote[];
  invoices: Invoice[];
  /** A simple "how far along is this" signal for the UI — not a strict
   * state machine, just: does a delivery note exist and is it signed,
   * and does an invoice exist. The chain can start at any step, so
   * "complete" just means an invoice exists in the chain. */
  status: {
    hasQuote: boolean;
    hasOrder: boolean;
    hasDeliveryNote: boolean;
    deliveryNoteSigned: boolean;
    hasInvoice: boolean;
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
  ) {}

  /** Resolves the chainId for a given document — if it doesn't have
   * one yet (an older record from before this feature, or a document
   * that's never been linked to anything), assigns it a fresh one on
   * the spot rather than failing, so every document is always
   * chain-viewable. */
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
    const [quotes, orders, deliveryNotes, invoices] = await Promise.all([
      this.quotesRepo.find({ where: { chainId, ...orgFilter }, order: { createdAt: 'ASC' } }),
      this.ordersRepo.find({ where: { chainId } as any, order: { createdAt: 'ASC' } }),
      this.deliveryNotesRepo.find({ where: { chainId, ...orgFilter }, order: { createdAt: 'ASC' } }),
      this.invoicesRepo.find({ where: { chainId, ...orgFilter }, order: { createdAt: 'ASC' } }),
    ]);

    const signedNote = deliveryNotes.find((n: any) => !!n.lesseeSignedAt || n.status === 'signed');

    return {
      chainId,
      quotes, orders, deliveryNotes, invoices,
      status: {
        hasQuote: quotes.length > 0,
        hasOrder: orders.length > 0,
        hasDeliveryNote: deliveryNotes.length > 0,
        deliveryNoteSigned: !!signedNote,
        hasInvoice: invoices.length > 0,
        complete: invoices.length > 0,
      },
    };
  }

  async getChainForDocument(docType: ChainDocType, id: number, organizationId: number | null): Promise<ChainResult> {
    const chainId = await this.resolveChainId(docType, id, organizationId);
    return this.getChain(chainId, organizationId);
  }

  private repoFor(docType: ChainDocType, id: number, organizationId: number | null) {
    const orgFilter = organizationId != null ? { organization: { id: organizationId } } : {};
    switch (docType) {
      case 'quote': return { repo: this.quotesRepo as Repository<any>, where: { id, ...orgFilter } };
      case 'order': return { repo: this.ordersRepo as Repository<any>, where: { id } };
      case 'delivery-note': return { repo: this.deliveryNotesRepo as Repository<any>, where: { id, ...orgFilter } };
      case 'invoice': return { repo: this.invoicesRepo as Repository<any>, where: { id, ...orgFilter } };
    }
  }
}
