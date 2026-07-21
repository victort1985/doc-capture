import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../organizations/entities/organization.entity';
import { ServiceCall } from '../calls/entities/service-call.entity';
import { Order } from '../orders/entities/order.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { QuoteSettings } from '../quotes/entities/quote-settings.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceSettings } from '../invoices/entities/invoice-settings.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { PhoneBookContact } from '../phonebook/entities/phonebook-contact.entity';
import { Location } from '../locations/entities/location.entity';
import { WarehouseItem } from '../warehouse/entities/warehouse-item.entity';
import { WarehouseTransfer } from '../warehouse/entities/warehouse-transfer.entity';
import { Vehicle } from '../fleet/entities/vehicle.entity';
import { StorageService } from '../storage/storage.service';

/**
 * Demo/sandbox organizations (Organization.isDemoMode) exist to show
 * the product to prospective customers, not to run a real business —
 * see Organization entity for the full list of what this deliberately
 * does NOT touch (organization record itself, logo, calendar sync,
 * order-intake email, document-sending email settings).
 *
 * Everything else transactional gets deleted once it's older than
 * demoRetentionDays. Deleting the PARENT rows here is enough for the
 * database side — every child table (warehouse transactions/repairs,
 * fuel refuels, etc.) already has onDelete: 'CASCADE' on its own
 * foreign key, so Postgres cleans those up automatically without
 * needing a repo for each one.
 *
 * The generated PDF FILES for quotes/invoices/delivery notes live in
 * whatever storage connection each org configured (local disk, FTP,
 * Synology...) and don't get touched by deleting the database row —
 * those are removed explicitly here, via the same StorageAdapter the
 * rest of the app already uses to write/read them, before the row
 * itself is deleted.
 */
@Injectable()
export class DemoCleanupService {
  private readonly logger = new Logger('DemoCleanupService');

  constructor(
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
    @InjectRepository(ServiceCall) private readonly callsRepo: Repository<ServiceCall>,
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    @InjectRepository(Quote) private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(QuoteSettings) private readonly quoteSettingsRepo: Repository<QuoteSettings>,
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(InvoiceSettings) private readonly invoiceSettingsRepo: Repository<InvoiceSettings>,
    @InjectRepository(DeliveryNote) private readonly deliveryNotesRepo: Repository<DeliveryNote>,
    @InjectRepository(DeliveryNoteSettings) private readonly deliveryNoteSettingsRepo: Repository<DeliveryNoteSettings>,
    @InjectRepository(PhoneBookContact) private readonly contactsRepo: Repository<PhoneBookContact>,
    @InjectRepository(Location) private readonly locationsRepo: Repository<Location>,
    @InjectRepository(WarehouseItem) private readonly warehouseItemsRepo: Repository<WarehouseItem>,
    @InjectRepository(WarehouseTransfer) private readonly warehouseTransfersRepo: Repository<WarehouseTransfer>,
    @InjectRepository(Vehicle) private readonly vehiclesRepo: Repository<Vehicle>,
    private readonly storageService: StorageService,
  ) {}

  /** Once a day at 03:10 — quiet hours, after any overnight batch jobs. */
  @Cron('10 3 * * *')
  async handleCron() {
    const demoOrgs = await this.orgRepo.find({ where: { isDemoMode: true } });
    for (const org of demoOrgs) {
      await this.cleanupOrg(org);
    }
  }

  /** Deletes the stored PDF for every expired row in `repo` that has a
   * non-null `pathColumn`, using whichever storage connection the
   * given settings row points to — a missing/broken connection just
   * skips file deletion for that batch (the DB row still gets deleted
   * by the caller regardless; an orphaned file left behind in that
   * edge case is far less harmful than blocking the whole cleanup). */
  private async cleanupStoredFiles(
    repo: Repository<any>,
    pathColumn: string,
    settingsRepo: Repository<any>,
    orgId: number,
    cutoff: Date,
  ): Promise<number> {
    const settings = await settingsRepo.findOne({ where: { organization: { id: orgId } }, relations: ['storageConnection'] });
    if (!settings?.storageConnection) return 0;

    const rows = await repo
      .createQueryBuilder('r')
      .where('r."organizationId" = :orgId', { orgId })
      .andWhere('r."createdAt" < :cutoff', { cutoff })
      .andWhere(`r."${pathColumn}" IS NOT NULL`)
      .getMany();
    if (rows.length === 0) return 0;

    const adapter = await this.storageService.getAdapter(settings.storageConnection.id);
    let removed = 0;
    for (const row of rows) {
      try {
        await adapter.remove(row[pathColumn]);
        removed++;
      } catch {
        // File already gone, or the connection is temporarily
        // unreachable — either way, don't let one bad file stop the
        // rest of the batch or block the DB row cleanup that follows.
      }
    }
    return removed;
  }

  async cleanupOrg(org: Organization): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (org.demoRetentionDays || 10));

    let filesRemoved = 0;
    filesRemoved += await this.cleanupStoredFiles(this.quotesRepo, 'storagePath', this.quoteSettingsRepo, org.id, cutoff);
    filesRemoved += await this.cleanupStoredFiles(this.invoicesRepo, 'storagePath', this.invoiceSettingsRepo, org.id, cutoff);
    filesRemoved += await this.cleanupStoredFiles(this.deliveryNotesRepo, 'pdfPath', this.deliveryNoteSettingsRepo, org.id, cutoff);

    const repos = [
      this.callsRepo, this.ordersRepo, this.quotesRepo, this.invoicesRepo,
      this.deliveryNotesRepo, this.contactsRepo, this.locationsRepo,
      this.warehouseItemsRepo, this.warehouseTransfersRepo, this.vehiclesRepo,
    ];

    let totalDeleted = 0;
    for (const repo of repos) {
      const result = await repo
        .createQueryBuilder()
        .delete()
        .where('organizationId = :orgId', { orgId: org.id })
        .andWhere('"createdAt" < :cutoff', { cutoff })
        .execute();
      totalDeleted += result.affected || 0;
    }

    this.logger.log(`Demo cleanup for org "${org.name}" (#${org.id}): removed ${totalDeleted} row(s) and ${filesRemoved} stored file(s) older than ${org.demoRetentionDays} day(s).`);
  }
}
