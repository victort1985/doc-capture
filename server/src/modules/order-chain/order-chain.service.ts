import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { Quote } from '../quotes/entities/quote.entity';
import { QuoteSettings } from '../quotes/entities/quote-settings.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceSettings } from '../invoices/entities/invoice-settings.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { Order } from '../orders/entities/order.entity';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentSettings } from '../payments/entities/payment-settings.entity';
import { StorageService } from '../storage/storage.service';
import { generateDocumentPdf } from '../documents/document-pdf.util';
import { DocumentStorageSettingsService } from '../document-storage-settings/document-storage-settings.service';
import { DocumentCategory } from '../document-storage-settings/entities/document-type-settings.entity';

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
    @InjectRepository(QuoteSettings) private readonly quoteSettingsRepo: Repository<QuoteSettings>,
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    @InjectRepository(DeliveryNote) private readonly deliveryNotesRepo: Repository<DeliveryNote>,
    @InjectRepository(DeliveryNoteSettings) private readonly deliveryNoteSettingsRepo: Repository<DeliveryNoteSettings>,
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(InvoiceSettings) private readonly invoiceSettingsRepo: Repository<InvoiceSettings>,
    @InjectRepository(Payment) private readonly paymentsRepo: Repository<Payment>,
    @InjectRepository(PaymentSettings) private readonly paymentSettingsRepo: Repository<PaymentSettings>,
    private readonly storageService: StorageService,
    private readonly orderStorageSettingsService: DocumentStorageSettingsService,
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

  /** Builds one combined PDF out of every document in a completed
   * chain (quote + delivery note + invoice + the receipt, stamped
   * "נאמן למקור" since it's necessarily a reprint at this point — the
   * original already went out when the payment was first recorded)
   * and saves it to storage. Called once, right after the chain
   * actually becomes complete (a payment gets recorded) — see
   * PaymentsService.create(). Silently skips any document whose PDF
   * isn't available (no storage configured for that document type,
   * or it was never generated) rather than failing the whole summary
   * over one missing piece. */
  async generateChainSummaryPdf(chainId: string, organizationId: number | null): Promise<string | null> {
    if (organizationId == null) return null;
    const chain = await this.getChain(chainId, organizationId);
    if (!chain.status.complete) return null; // only makes sense once the chain is actually done

    const summary = await PDFDocument.create();
    let pageCount = 0;

    /** Orders (and occasionally other document types, depending on
     * how they were captured) are frequently a scanned photo, not a
     * true PDF — PDFDocument.load() throws on those, and the previous
     * version of this function silently swallowed that error, which
     * is exactly why orders never appeared in a chain summary even
     * once they got added to this loop: every single one failed to
     * parse as a PDF and got dropped. Detect the format from the file
     * signature and embed images as their own page instead of assuming
     * everything is already a PDF. */
    const appendPdf = async (bytes: Buffer | null) => {
      if (!bytes) return;
      try {
        if (isJpeg(bytes) || isPng(bytes)) {
          const image = isJpeg(bytes) ? await summary.embedJpg(bytes) : await summary.embedPng(bytes);
          const page = summary.addPage([image.width, image.height]);
          page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
          pageCount += 1;
          return;
        }
        const doc = await PDFDocument.load(bytes);
        const pages = await summary.copyPages(doc, doc.getPageIndices());
        pages.forEach((p) => summary.addPage(p));
        pageCount += pages.length;
      } catch {
        // A corrupt/unreadable individual file shouldn't take down the
        // whole summary — just skip it.
      }
    };

    for (const quote of chain.quotes) {
      const settings = await this.quoteSettingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection'] });
      if (settings?.storageConnection && quote.storagePath) {
        const adapter = await this.storageService.getAdapter(settings.storageConnection.id);
        await appendPdf(await adapter.read(quote.storagePath).catch(() => null));
      }
    }

    for (const order of chain.orders) {
      // Orders aren't org-scoped storage settings the way quotes/
      // invoices/notes are — same resolution OrdersService itself uses
      // (routing config for DocumentCategory.ORDER, falling back to
      // ORDERS_STORAGE_CONNECTION_ID / connection id 1).
      try {
        const routed = await this.orderStorageSettingsService.findOne(DocumentCategory.ORDER, null);
        const connectionId = routed?.storageConnection?.id ?? parseInt(process.env.ORDERS_STORAGE_CONNECTION_ID || '1', 10);
        const adapter = await this.storageService.getAdapter(connectionId);
        await appendPdf(await adapter.read(order.storagePath).catch(() => null));
      } catch {
        // storage not configured for orders — skip, same as the other document types
      }
    }

    for (const note of chain.deliveryNotes) {
      const settings = await this.deliveryNoteSettingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection'] });
      if (settings?.storageConnection && (note as any).pdfPath) {
        const adapter = await this.storageService.getAdapter(settings.storageConnection.id);
        await appendPdf(await adapter.read((note as any).pdfPath).catch(() => null));
      }
    }

    for (const invoice of chain.invoices) {
      const settings = await this.invoiceSettingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection'] });
      if (settings?.storageConnection && invoice.storagePath) {
        const adapter = await this.storageService.getAdapter(settings.storageConnection.id);
        await appendPdf(await adapter.read(invoice.storagePath).catch(() => null));
      }
    }

    // The receipt always goes in freshly rendered WITH the "certified
    // true copy" stamp — by definition, any copy included in a summary
    // bundle generated after the fact is not the original that already
    // went out to the client when the payment was first recorded.
    let paymentSettings: PaymentSettings | null = null;
    for (const payment of chain.payments) {
      paymentSettings ??= await this.paymentSettingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection', 'organization'] });
      if (!paymentSettings) continue;
      const header = (await this.deliveryNoteSettingsRepo.findOne({ where: { organization: { id: organizationId } } })) ?? {};
      const methodLabel = {
        cash: 'מזומן', bank_transfer: 'העברה בנקאית', check: "צ'ק", bit: 'ביט',
        standing_order: 'הרשאה לחיוב חשבון', credit_card: 'כרטיס אשראי',
      }[payment.method] ?? 'כרטיס אשראי';
      const bytes = await generateDocumentPdf({
        docTypeLabel: 'קבלה',
        docNumber: payment.paymentNumber ?? `#${payment.id}`,
        date: payment.date ?? new Date().toISOString().slice(0, 10),
        clientName: payment.clientName,
        clientEmail: payment.clientEmail,
        items: [{ description: `תשלום — ${methodLabel}`, quantity: 1, unitPrice: payment.amount }],
        total: payment.amount,
        footerText: paymentSettings.footerText,
        header,
        template: (paymentSettings.template as any) ?? 'classic',
        isDemoMode: paymentSettings.organization?.isDemoMode ?? false,
        vatEnabled: paymentSettings.vatEnabled,
        stampText: 'נאמן למקור',
      });
      await appendPdf(bytes);
    }

    if (pageCount === 0) return null;

    const bytes = Buffer.from(await summary.save());
    // Saved via whichever storage connection Payment settings point
    // to — as good a default as any single choice, since the summary
    // conceptually belongs to the completed order as a whole rather
    // than to any one document type.
    if (!paymentSettings?.storageConnection) return null;
    const adapter = await this.storageService.getAdapter(paymentSettings.storageConnection.id);
    const relativePath = `ChainSummaries/${chainId}.pdf`;
    await adapter.write(relativePath, bytes);
    return relativePath;
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

/** JPEG files start with the SOI marker 0xFFD8. */
function isJpeg(bytes: Buffer): boolean {
  return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/** PNG files start with an 8-byte fixed signature. */
function isPng(bytes: Buffer): boolean {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length > sig.length && sig.every((b, i) => bytes[i] === b);
}
