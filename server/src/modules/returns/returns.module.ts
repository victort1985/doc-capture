import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReturnNote } from './entities/return-note.entity';
import { ReturnNoteSettings } from './entities/return-note-settings.entity';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';
import { ReturnSettingsController } from './return-settings.controller';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageModule } from '../storage/storage.module';
import { DocumentEmailModule } from '../document-email/document-email.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReturnNote, ReturnNoteSettings, DeliveryNote, DeliveryNoteSettings]),
    StorageModule,
    DocumentEmailModule,
    UsersModule,
  ],
  controllers: [ReturnsController, ReturnSettingsController],
  providers: [ReturnsService],
})
export class ReturnsModule {}
