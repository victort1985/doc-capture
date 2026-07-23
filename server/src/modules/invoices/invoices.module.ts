import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoiceSettings } from './entities/invoice-settings.entity';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoiceSettingsController } from './invoice-settings.controller';
import { UsersModule } from '../users/users.module';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageModule } from '../storage/storage.module';
import { DocumentEmailModule } from '../document-email/document-email.module';
import { Quote } from '../quotes/entities/quote.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, InvoiceSettings, DeliveryNoteSettings, Quote, DeliveryNote]), UsersModule, StorageModule, DocumentEmailModule],
  controllers: [InvoicesController, InvoiceSettingsController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
