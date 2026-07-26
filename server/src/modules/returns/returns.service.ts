import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReturnNote } from './entities/return-note.entity';
import { ReturnNoteSettings } from './entities/return-note-settings.entity';
import { CreateReturnDto } from './dto/create-return.dto';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageService } from '../storage/storage.service';
import { generateDocumentPdf } from '../documents/document-pdf.util';
import { DocumentSendingService } from '../document-email/document-sending.service';
import { writeMaybeEncrypted, readMaybeEncrypted } from '../../common/crypto/encrypted-storage.util';
import { WarehouseService } from '../warehouse/warehouse.service';
import { TransactionType } from '../warehouse/entities/warehouse-transaction.entity';

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(ReturnNote) private readonly repo: Repository<ReturnNote>,
    @InjectRepository(ReturnNoteSettings) private readonly settingsRepo: Repository<ReturnNoteSettings>,
    @InjectRepository(DeliveryNote) private readonly deliveryNotesRepo: Repository<DeliveryNote>,
    @InjectRepository(DeliveryNoteSettings) private readonly noteSettingsRepo: Repository<DeliveryNoteSettings>,
    private readonly storageService: StorageService,
    private readonly documentSendingService: DocumentSendingService,
    private readonly warehouseService: WarehouseService,
  ) {}

  private async generateReturnNumber(organizationId: number | null): Promise<string> {
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

  async findAll(organizationId: number | null): Promise<ReturnNote[]> {
    return this.repo.find({
      where: organizationId != null ? { organization: { id: organizationId } } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, organizationId: number | null): Promise<ReturnNote> {
    const note = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!note) throw new NotFoundException('Return not found');
    if (organizationId != null && note.organization?.id !== organizationId) {
      throw new NotFoundException('Return not found');
    }
    return note;
  }

  async create(organizationId: number | null, userId: number, dto: CreateReturnDto): Promise<ReturnNote> {
    const deliveryNote = await this.deliveryNotesRepo.findOne({ where: { id: dto.deliveryNoteId } });
    if (!deliveryNote) throw new NotFoundException('The delivery note these items were sent out on was not found.');
    if (organizationId != null && (deliveryNote as any).organization?.id !== organizationId) {
      throw new NotFoundException('The delivery note these items were sent out on was not found.');
    }

    const returnNote = this.repo.create({
      returnNumber: await this.generateReturnNumber(organizationId),
      clientName: dto.clientName,
      clientEmail: dto.clientEmail,
      date: dto.date ?? new Date().toISOString().slice(0, 10),
      reason: dto.reason,
      items: dto.items,
      deliveryNoteId: dto.deliveryNoteId,
      chainId: (deliveryNote as any).chainId,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      createdBy: { id: userId } as any,
    });
    const saved = await this.repo.save(returnNote);
    saved.storagePath = await this.tryGeneratePdf(saved, organizationId);
    const result = await this.repo.save(saved);

    // Any line linked to an actual warehouse item comes back into
    // stock — best-effort per item, since one bad link (e.g. an item
    // that got deleted from the warehouse since) shouldn't undo an
    // otherwise-successful return record.
    for (const item of dto.items) {
      if (!item.warehouseItemId) continue;
      try {
        await this.warehouseService.addTransaction(
          item.warehouseItemId,
          TransactionType.IN,
          item.quantity,
          `Return ${result.returnNumber ?? `#${result.id}`} — ${result.clientName}`,
          undefined,
          userId,
        );
      } catch {
        // best-effort — see comment above
      }
    }

    return result;
  }

  private async tryGeneratePdf(returnNote: ReturnNote, organizationId: number | null): Promise<string | null> {
    if (organizationId == null) return null;
    const settings = await this.settingsRepo.findOne({ where: { organization: { id: organizationId } }, relations: ['storageConnection', 'organization'] });
    if (!settings?.storageConnection) return null;

    try {
      const header = (await this.noteSettingsRepo.findOne({ where: { organization: { id: organizationId } } })) ?? {};
      const pdfBytes = await generateDocumentPdf({
        docTypeLabel: 'תעודת החזרה',
        docNumber: returnNote.returnNumber ?? `#${returnNote.id}`,
        date: returnNote.date ?? new Date().toISOString().slice(0, 10),
        clientName: returnNote.clientName,
        clientEmail: returnNote.clientEmail,
        items: returnNote.items.map((i) => ({ description: `${i.name}${i.notes ? ` (${i.notes})` : ''}`, quantity: i.quantity, unitPrice: 0 })),
        total: 0,
        footerText: `${returnNote.reason}${settings.footerText ? `\n${settings.footerText}` : ''}`,
        header,
        template: (settings.template as any) ?? 'classic',
        isDemoMode: settings.organization?.isDemoMode ?? false,
      });
      const { adapter, encryptAtRest } = await this.storageService.getAdapterWithMeta(settings.storageConnection.id);
      const relativePath = `Returns/${returnNote.returnNumber ?? returnNote.id}.pdf`;
      const finalPath = await writeMaybeEncrypted(adapter, relativePath, pdfBytes, encryptAtRest);

      if (settings.autoSendEmail) {
        this.documentSendingService
          .sendDocument({
            clientEmail: returnNote.clientEmail,
            filename: relativePath.split('/').pop()!,
            pdfBuffer: pdfBytes,
            subject: `תעודת החזרה ${returnNote.returnNumber ?? returnNote.id}`,
          })
          .catch(() => {});
      }
      return finalPath;
    } catch {
      return null;
    }
  }

  async getPdfBuffer(id: number, organizationId: number | null): Promise<Buffer> {
    const returnNote = await this.findOne(id, organizationId);
    if (!returnNote.storagePath) throw new NotFoundException('No PDF has been generated for this return yet');
    const settings = await this.settingsRepo.findOne({
      where: { organization: { id: returnNote.organization?.id } },
      relations: ['storageConnection'],
    });
    if (!settings?.storageConnection) throw new NotFoundException('Storage connection is no longer configured');
    const { adapter } = await this.storageService.getAdapterWithMeta(settings.storageConnection.id);
    return readMaybeEncrypted(adapter, returnNote.storagePath);
  }
}
