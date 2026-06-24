import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryNote } from './delivery-note.entity';
import { DeliveryNoteSettings } from './delivery-note-settings.entity';
import { DeliveryNotesService } from './delivery-notes.service';
import { DeliveryNotesController } from './delivery-notes.controller';
import { DeliveryNoteSettingsController } from './delivery-note-settings.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryNote, DeliveryNoteSettings]), StorageModule],
  controllers: [DeliveryNotesController, DeliveryNoteSettingsController],
  providers: [DeliveryNotesService],
  exports: [DeliveryNotesService],
})
export class DeliveryNotesModule {}
