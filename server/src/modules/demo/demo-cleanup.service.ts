import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '../organizations/entities/organization.entity';
import { ServiceCall } from '../calls/entities/service-call.entity';
import { Order } from '../orders/entities/order.entity';
import { Quote } from '../quotes/entities/quote.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { PhonebookContact } from '../phonebook/entities/phonebook-contact.entity';
import { Location } from '../locations/entities/location.entity';
import { WarehouseItem } from '../warehouse/entities/warehouse-item.entity';
import { WarehouseTransfer } from '../warehouse/entities/warehouse-transfer.entity';
import { Vehicle } from '../fleet/entities/vehicle.entity';

/**
 * Demo/sandbox organizations (Organization.isDemoMode) exist to show
 * the product to prospective customers, not to run a real business —
 * see Organization entity for the full list of what this deliberately
 * does NOT touch (organization record itself, logo, calendar sync,
 * order-intake email, document-sending email settings).
 *
 * Everything else transactional gets deleted once it's older than
 * demoRetentionDays. Deleting the PARENT rows here is enough — every
 * child table (warehouse transactions/repairs, fuel refuels, etc.)
 * already has onDelete: 'CASCADE' on its own foreign key, so Postgres
 * cleans those up automatically without needing a repo for each one.
 */
@Injectable()
export class DemoCleanupService {
  private readonly logger = new Logger('DemoCleanupService');

  constructor(
    @InjectRepository(Organization) private readonly orgRepo: Repository<Organization>,
    @InjectRepository(ServiceCall) private readonly callsRepo: Repository<ServiceCall>,
    @InjectRepository(Order) private readonly ordersRepo: Repository<Order>,
    @InjectRepository(Quote) private readonly quotesRepo: Repository<Quote>,
    @InjectRepository(Invoice) private readonly invoicesRepo: Repository<Invoice>,
    @InjectRepository(DeliveryNote) private readonly deliveryNotesRepo: Repository<DeliveryNote>,
    @InjectRepository(PhonebookContact) private readonly contactsRepo: Repository<PhonebookContact>,
    @InjectRepository(Location) private readonly locationsRepo: Repository<Location>,
    @InjectRepository(WarehouseItem) private readonly warehouseItemsRepo: Repository<WarehouseItem>,
    @InjectRepository(WarehouseTransfer) private readonly warehouseTransfersRepo: Repository<WarehouseTransfer>,
    @InjectRepository(Vehicle) private readonly vehiclesRepo: Repository<Vehicle>,
  ) {}

  /** Once a day at 03:10 — quiet hours, after any overnight batch jobs. */
  @Cron('10 3 * * *')
  async handleCron() {
    const demoOrgs = await this.orgRepo.find({ where: { isDemoMode: true } });
    for (const org of demoOrgs) {
      await this.cleanupOrg(org);
    }
  }

  async cleanupOrg(org: Organization): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - (org.demoRetentionDays || 10));

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

    this.logger.log(`Demo cleanup for org "${org.name}" (#${org.id}): removed ${totalDeleted} row(s) older than ${org.demoRetentionDays} day(s).`);
  }
}
