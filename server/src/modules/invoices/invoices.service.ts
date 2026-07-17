import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(@InjectRepository(Invoice) private readonly repo: Repository<Invoice>) {}

  private computeTotal(items: { quantity: number; unitPrice: number }[]): number {
    return Math.round(items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0) * 100) / 100;
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
    // Simple per-organization running number: "INV-{count+1}". Not
    // gap-free/compliance-grade — see entity doc comment.
    const count = await this.repo.count({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
    });
    const invoice = this.repo.create({
      invoiceNumber: `INV-${1000 + count + 1}`,
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
    return this.repo.save(invoice);
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
