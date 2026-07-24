import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Payment } from './entities/payment.entity';
import { PaymentSettings } from './entities/payment-settings.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageService } from '../storage/storage.service';
import { generateDocumentPdf } from '../documents/document-pdf.util';
import { DocumentSendingService } from '../document-email/document-sending.service';
import { Invoice } from '../invoices/entities/invoice.entity';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly repo: Repository<Payment>,
    @InjectRepository(PaymentSettings) private readonly settingsRepo: Repository<PaymentSettings>,
    @InjectRepository(DeliveryNoteSettings) private readonly noteSettingsRepo: Repository<DeliveryNoteSettings>,
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    private readonly storageService: StorageService,
    private readonly documentSendingService: DocumentSendingService,
  ) {}

  /** See QuotesService.generateQuoteNumber — same fix, same reasoning:
   * a persistent counter, never COUNT(*) of existing rows. */
  private async generatePaymentNumber(organizationId: number | null): Promise<string> {
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

  async findAll(organizationId: number | null): Promise<Payment[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, organizationId: number | null): Promise<Payment> {
    const payment = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!payment) throw new NotFoundException('Payment not found');
    if (organizationId != null && payment.organization?.id !== organizationId) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  async create(organizationId: number | null, userId: number, dto: CreatePaymentDto): Promise<Payment> {
    const chainId = await this.resolveChainIdForCreate(dto.invoiceId, dto.chainId);
    const payment = this.repo.create({
      paymentNumber: await this.generatePaymentNumber(organizationId),
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      date: dto.date ?? new Date().toISOString().slice(0, 10),
      amount: dto.amount,
      method: dto.method,
      notes: dto.notes,
      invoiceId: dto.invoiceId,
      chainId,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    const saved = await this.repo.save(payment);
    saved.storagePath = await this.tryGeneratePdf(saved, organizationId);
    return this.repo.save(saved);
  }

  /** Joins the chain of the linked invoice, back-filling it with a
   * fresh chainId first if it never had one — same pattern as
   * InvoicesService.resolveChainIdForCreate. Payment is the last link:
   * a chain with a Payment in it is what order-chain considers
   * "complete". */
  private async resolveChainIdForCreate(invoiceId: number | undefined, explicitChainId: string | undefined): Promise<string> {
    if (invoiceId) {
      const invoice = await this.invoicesRepo.findOne({ where: { id: invoiceId } });
      if (invoice) {
        if (!invoice.chainId) {
          invoice.chainId = crypto.randomUUID();
          await this.invoicesRepo.save(invoice);
        }
        return invoice.chainId;
      }
    }
    return explicitChainId || crypto.randomUUID();
  }

  private async tryGeneratePdf(payment: Payment, organizationId: number | null, throwOnError = false): Promise<string | null> {
    if (organizationId == null) {
      if (throwOnError) {
        throw new BadRequestException(
          'This account isn\'t assigned to an organization, so there\'s no Payment settings (template, storage) to generate against.',
        );
      }
      return null;
    }
    const settings = await this.settingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection', 'organization'] });
    if (!settings?.storageConnection) {
      if (throwOnError) throw new BadRequestException('No storage connection is configured in Payment settings.');
      return null;
    }

    try {
      const header = (await this.noteSettingsRepo.findOne({ where: { organization: { id: organizationId } } })) ?? {};
      const pdfBytes = await generateDocumentPdf({
        docTypeLabel: 'קבלה',
        docNumber: payment.paymentNumber ?? `#${payment.id}`,
        date: payment.date ?? new Date().toISOString().slice(0, 10),
        clientName: payment.clientName,
        clientEmail: payment.clientEmail,
        items: [{ description: `תשלום — ${this.methodLabel(payment.method)}`, quantity: 1, unitPrice: payment.amount }],
        total: payment.amount,
        footerText: settings.footerText,
        header,
        template: (settings.template as any) ?? 'classic',
        isDemoMode: settings.organization?.isDemoMode ?? false,
      });
      const adapter = await this.storageService.getAdapter(settings.storageConnection.id);
      const relativePath = `Payments/${payment.paymentNumber ?? payment.id}.pdf`;
      await adapter.write(relativePath, pdfBytes);

      if (settings.autoSendEmail) {
        this.documentSendingService
          .sendDocument({
            clientEmail: payment.clientEmail,
            filename: relativePath.split('/').pop()!,
            pdfBuffer: pdfBytes,
            subject: `קבלה ${payment.paymentNumber ?? payment.id}`,
          })
          .catch(() => {});
      }

      return relativePath;
    } catch (err) {
      if (throwOnError) throw err;
      return null;
    }
  }

  private methodLabel(method: Payment['method']): string {
    switch (method) {
      case 'cash': return 'מזומן';
      case 'transfer': return 'העברה בנקאית';
      default: return 'כרטיס אשראי';
    }
  }

  async regeneratePdf(id: number, organizationId: number | null): Promise<Payment> {
    const payment = await this.findOne(id, organizationId);
    payment.storagePath = await this.tryGeneratePdf(payment, payment.organization?.id ?? organizationId, true);
    return this.repo.save(payment);
  }

  async getPdfBuffer(id: number, organizationId: number | null): Promise<Buffer> {
    const payment = await this.findOne(id, organizationId);
    if (!payment.storagePath) throw new NotFoundException('No PDF has been generated for this payment yet');
    const settings = await this.settingsRepo.findOne({
      where: { organization: { id: payment.organization?.id } },
      relations: ['storageConnection'],
    });
    if (!settings?.storageConnection) throw new NotFoundException('Storage connection is no longer configured');
    const adapter = await this.storageService.getAdapter(settings.storageConnection.id);
    return adapter.read(payment.storagePath);
  }

  async remove(id: number, organizationId: number | null): Promise<void> {
    const payment = await this.findOne(id, organizationId);
    await this.repo.remove(payment);
  }
}
