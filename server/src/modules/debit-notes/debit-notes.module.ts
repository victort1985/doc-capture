import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DebitNote } from './entities/debit-note.entity';
import { DebitNoteSettings } from './entities/debit-note-settings.entity';
import { DebitNotesService } from './debit-notes.service';
import { DebitNotesController } from './debit-notes.controller';
import { DebitNoteSettingsController } from './debit-note-settings.controller';
import { Invoice } from '../invoices/entities/invoice.entity';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageModule } from '../storage/storage.module';
import { DocumentEmailModule } from '../document-email/document-email.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DebitNote, DebitNoteSettings, Invoice, DeliveryNoteSettings]),
    StorageModule,
    DocumentEmailModule,
    UsersModule,
  ],
  controllers: [DebitNotesController, DebitNoteSettingsController],
  providers: [DebitNotesService],
})
export class DebitNotesModule {}
