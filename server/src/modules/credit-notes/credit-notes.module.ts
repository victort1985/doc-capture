import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreditNote } from './entities/credit-note.entity';
import { CreditNoteSettings } from './entities/credit-note-settings.entity';
import { CreditNotesService } from './credit-notes.service';
import { CreditNotesController } from './credit-notes.controller';
import { CreditNoteSettingsController } from './credit-note-settings.controller';
import { Invoice } from '../invoices/entities/invoice.entity';
import { InvoiceSettings } from '../invoices/entities/invoice-settings.entity';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageModule } from '../storage/storage.module';
import { DocumentEmailModule } from '../document-email/document-email.module';
import { UsersModule } from '../users/users.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreditNote, CreditNoteSettings, Invoice, InvoiceSettings, DeliveryNoteSettings]),
    StorageModule,
    DocumentEmailModule,
    UsersModule,
    AccountingModule,
  ],
  controllers: [CreditNotesController, CreditNoteSettingsController],
  providers: [CreditNotesService],
})
export class CreditNotesModule {}
