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

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, InvoiceSettings, DeliveryNoteSettings]), UsersModule, StorageModule],
  controllers: [InvoicesController, InvoiceSettingsController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
