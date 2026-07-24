import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentSettings } from './entities/payment-settings.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymentSettingsController } from './payment-settings.controller';
import { UsersModule } from '../users/users.module';
import { DeliveryNoteSettings } from '../delivery-notes/delivery-note-settings.entity';
import { StorageModule } from '../storage/storage.module';
import { DocumentEmailModule } from '../document-email/document-email.module';
import { Invoice } from '../invoices/entities/invoice.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, PaymentSettings, DeliveryNoteSettings, Invoice]), UsersModule, StorageModule, DocumentEmailModule],
  controllers: [PaymentsController, PaymentSettingsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
