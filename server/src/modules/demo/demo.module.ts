import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
import { StorageModule } from '../storage/storage.module';
import { DemoCleanupService } from './demo-cleanup.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization, ServiceCall, Order, Quote, QuoteSettings, Invoice, InvoiceSettings,
      DeliveryNote, DeliveryNoteSettings, PhoneBookContact, Location,
      WarehouseItem, WarehouseTransfer, Vehicle,
    ]),
    StorageModule,
  ],
  providers: [DemoCleanupService],
  exports: [DemoCleanupService],
})
export class DemoModule {}
