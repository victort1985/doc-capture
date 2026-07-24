import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PDFDocument } from 'pdf-lib';
import { Order, OrderSource } from './entities/order.entity';
import { StorageService } from '../storage/storage.service';
import { OrderPdfParserService, ParsedOrderFields } from './order-pdf-parser.service';
import { OrderNotificationService } from './order-notification.service';
import { DocumentStorageSettingsService } from '../document-storage-settings/document-storage-settings.service';
import { DocumentCategory } from '../document-storage-settings/entities/document-type-settings.entity';

export interface OrderListItem {
  id: number;
  orderDate: string;
  organization: string;
  poNumberLast4: string;
  invoiceNumber?: string | null;
  completed: boolean;
  generatedName: string;
  createdAt: Date;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly ordersRepo: Repository<Order>,
    private readonly storageService: StorageService,
    private readonly parserService: OrderPdfParserService,
    private readonly notificationService: OrderNotificationService,
    private readonly storageSettingsService: DocumentStorageSettingsService,
  ) {}

  /** "{date} - {organization} - רכש {poNumberLast4} - תמ {invoiceNumber|0000}[ - {invoiceDescription}]" */
  generateName(order: Pick<Order, 'orderDate' | 'organization' | 'poNumberLast4' | 'invoiceNumber' | 'invoiceDescription'>): string {
    const invoicePart = order.invoiceNumber?.trim() || '0000';
    const base = `${order.orderDate} - ${order.organization} - רכש ${order.poNumberLast4} - תמ ${invoicePart}`;
    const description = order.invoiceDescription?.trim();
    return description ? `${base} - ${description}` : base;
  }

  toListItem(o: Order): OrderListItem {
    return {
      id: o.id,
      orderDate: o.orderDate,
      organization: o.organization,
      poNumberLast4: o.poNumberLast4,
      invoiceNumber: o.invoiceNumber,
      completed: !!o.invoiceNumber,
      generatedName: this.generateName(o),
      createdAt: o.createdAt,
    };
  }

  async findAll(tenantId: number | null): Promise<OrderListItem[]> {
    const qb = this.ordersRepo.createQueryBuilder('o').orderBy('o.orderDate', 'DESC').addOrderBy('o.createdAt', 'DESC');
    if (tenantId != null) qb.where('(o.tenantId = :tenantId OR o.tenantId IS NULL)', { tenantId });
    const orders = await qb.getMany();
    return orders.map((o) => this.toListItem(o));
  }

  async findOne(id: number, tenantId: number | null): Promise<Order> {
    const qb = this.ordersRepo.createQueryBuilder('o').where('o.id = :id', { id });
    if (tenantId != null) qb.andWhere('(o.tenantId = :tenantId OR o.tenantId IS NULL)', { tenantId });
    const order = await qb.getOne();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async getPdfBuffer(order: Order): Promise<Buffer> {
    const { adapter } = await this.storageService.getAdapterWithMeta(await this.resolveConnectionId());
    return adapter.read(order.storagePath);
  }

  /** Manual capture from the app — the person already scanned/picked
   * the PO as a PDF; this parses it the same way an emailed one would
   * be, but lets the fields be corrected immediately since there's no
   * automatic retry loop the way there is for the inbox poller. */
  async createManual(
    userId: number,
    tenantId: number | null,
    pdfBuffer: Buffer,
    overrides?: Partial<ParsedOrderFields>,
  ): Promise<Order> {
    const parsed = await this.parserService.parse(pdfBuffer);
    const fields: ParsedOrderFields = {
      orderDate: overrides?.orderDate || parsed?.orderDate || new Date().toISOString().slice(0, 10),
      organization: overrides?.organization || parsed?.organization || 'Unknown',
      poNumberLast4: overrides?.poNumberLast4 || parsed?.poNumberLast4 || '0000',
    };

    const storagePath = await this.writeOrderPdf(fields, pdfBuffer);
    const order = this.ordersRepo.create({
      ...fields,
      source: OrderSource.MANUAL,
      storagePath,
      tenant: tenantId != null ? ({ id: tenantId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    return this.ordersRepo.save(order);
  }

  /** Used by the Gmail poller for an automatically-captured order. */
  async createFromEmail(pdfBuffer: Buffer, fields: ParsedOrderFields, emailSubject: string): Promise<Order> {
    const storagePath = await this.writeOrderPdf(fields, pdfBuffer);
    const order = this.ordersRepo.create({
      ...fields,
      source: OrderSource.EMAIL,
      storagePath,
      sourceEmailSubject: emailSubject,
    });
    return this.ordersRepo.save(order);
  }

  /** Appends the scanned delivery-note page as page 2+ of the order
   * PDF, sets the real invoice number in place of the "0000"
   * placeholder, and renames the stored file to match — this is the
   * one point where an order transitions from pending to complete. */
  async addInvoicePage(
    id: number,
    tenantId: number | null,
    invoiceNumber: string,
    invoicePdfBuffer: Buffer,
    description?: string,
  ): Promise<Order> {
    const order = await this.findOne(id, tenantId);
    const existingBuffer = await this.getPdfBuffer(order);

    const merged = await PDFDocument.create();
    const existingDoc = await PDFDocument.load(existingBuffer);
    const existingPages = await merged.copyPages(existingDoc, existingDoc.getPageIndices());
    existingPages.forEach((p) => merged.addPage(p));

    const invoiceDoc = await PDFDocument.load(invoicePdfBuffer);
    const invoicePages = await merged.copyPages(invoiceDoc, invoiceDoc.getPageIndices());
    invoicePages.forEach((p) => merged.addPage(p));

    const mergedBytes = Buffer.from(await merged.save());

    order.invoiceNumber = invoiceNumber;
    order.invoiceDescription = description?.trim() || null;
    const newPath = await this.writeOrderPdf(order, mergedBytes);
    await this.deleteStoredFile(order.storagePath).catch(() => {});
    order.storagePath = newPath;

    const saved = await this.ordersRepo.save(order);
    await this.notificationService.sendCompletionEmail(this.generateName(saved), mergedBytes);
    return saved;
  }

  async remove(id: number, tenantId: number | null): Promise<void> {
    const order = await this.findOne(id, tenantId);
    await this.deleteStoredFile(order.storagePath).catch(() => {});
    await this.ordersRepo.remove(order);
  }

  private async writeOrderPdf(
    fields: Pick<Order, 'orderDate' | 'organization' | 'poNumberLast4' | 'invoiceNumber' | 'invoiceDescription'>,
    buffer: Buffer,
  ): Promise<string> {
    const name = this.generateName(fields);
    const safeName = name.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_');
    const storagePath = `Orders/${safeName}.pdf`;
    const { adapter } = await this.storageService.getAdapterWithMeta(await this.resolveConnectionId());
    await adapter.write(storagePath, buffer);
    return storagePath;
  }

  private async deleteStoredFile(storagePath: string): Promise<void> {
    const { adapter } = await this.storageService.getAdapterWithMeta(await this.resolveConnectionId());
    await adapter.remove(storagePath);
  }

  // Orders live in one fixed connection rather than per-user routing
  // (like documents/photos do) since the whole point is one shared
  // company-wide order inbox, not something that varies by who's
  // logged in. Configured on the Routing page (DocumentCategory.ORDER,
  // stored with organization=null since orders aren't org-scoped) —
  // falls back to ORDERS_STORAGE_CONNECTION_ID (or connection id 1)
  // for installs that haven't set it there yet.
  private async resolveConnectionId(): Promise<number> {
    const routed = await this.storageSettingsService.findOne(DocumentCategory.ORDER, null);
    if (routed?.storageConnection?.id) return routed.storageConnection.id;
    return parseInt(process.env.ORDERS_STORAGE_CONNECTION_ID || '1', 10);
  }
}
