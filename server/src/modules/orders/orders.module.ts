import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderEmailSettings } from './entities/order-email-settings.entity';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderEmailSettingsService } from './order-email-settings.service';
import { OrderEmailSettingsController } from './order-email-settings.controller';
import { OrderPdfParserService } from './order-pdf-parser.service';
import { GmailOrderPollerService } from './gmail-order-poller.service';
import { OrderNotificationService } from './order-notification.service';
import { StorageModule } from '../storage/storage.module';
import { Organization } from '../organizations/entities/organization.entity';
import { DocumentStorageSettingsModule } from '../document-storage-settings/document-storage-settings.module';

/**
 * Deploy notes:
 * - Needs `tesseract-ocr`, `tesseract-ocr-heb`, and `poppler-utils`
 *   (pdftoppm) installed on the server (apt install).
 * - Needs `npm install imapflow mailparser` (added to package.json).
 * - New tables: orders, order_email_settings (migration required,
 *   synchronize is off in prod).
 * - Orders live in one fixed storage connection shared by everyone,
 *   configured on the Routing page (DocumentCategory.ORDER) — falls
 *   back to ORDERS_STORAGE_CONNECTION_ID env var / connection id 1
 *   for installs that haven't set it there yet.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderEmailSettings, Organization]), StorageModule, DocumentStorageSettingsModule],
  controllers: [OrderEmailSettingsController, OrdersController],
  providers: [OrdersService, OrderEmailSettingsService, OrderPdfParserService, GmailOrderPollerService, OrderNotificationService],
})
export class OrdersModule {}
