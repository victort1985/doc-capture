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
import { CreditNote } from '../credit-notes/entities/credit-note.entity';
import { CreditNoteSettings } from '../credit-notes/entities/credit-note-settings.entity';
import { DebitNote } from '../debit-notes/entities/debit-note.entity';
import { DebitNoteSettings } from '../debit-notes/entities/debit-note-settings.entity';
import { ReturnNote } from '../returns/entities/return-note.entity';
import { ReturnNoteSettings } from '../returns/entities/return-note-settings.entity';
import { StorageModule } from '../storage/storage.module';
import { DocumentStorageSettingsModule } from '../document-storage-settings/document-storage-settings.module';
import { OrderChainService } from './order-chain.service';
import { OrderChainController } from './order-chain.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Quote, QuoteSettings, Invoice, InvoiceSettings, DeliveryNote, DeliveryNoteSettings,
      Order, Payment, PaymentSettings,
      CreditNote, CreditNoteSettings, DebitNote, DebitNoteSettings, ReturnNote, ReturnNoteSettings,
    ]),
    StorageModule,
    DocumentStorageSettingsModule,
  ],
  controllers: [OrderChainController],
  providers: [OrderChainService],
  exports: [OrderChainService],
})
export class OrderChainModule {}
