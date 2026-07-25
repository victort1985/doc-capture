import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quote } from '../quotes/entities/quote.entity';
import { QuoteSettings } from '../quotes/entities/quote-settings.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceSettings } from '../invoices/entities/invoice-settings.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { Order } from '../orders/entities/order.entity';
import { Payment } from '../payments/entities/payment.entity';
import { PaymentSettings } from '../payments/entities/payment-settings.entity';
import { StorageModule } from '../storage/storage.module';
import { DocumentStorageSettingsModule } from '../document-storage-settings/document-storage-settings.module';
import { OrderChainService } from './order-chain.service';
import { OrderChainController } from './order-chain.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Quote, QuoteSettings, Invoice, InvoiceSettings, DeliveryNote, DeliveryNoteSettings,
      Order, Payment, PaymentSettings,
    ]),
    StorageModule,
    DocumentStorageSettingsModule,
  ],
  controllers: [OrderChainController],
  providers: [OrderChainService],
  exports: [OrderChainService],
})
export class OrderChainModule {}
