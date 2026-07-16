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
import { StorageModule } from '../storage/storage.module';

/**
 * Deploy notes:
 * - Needs `tesseract-ocr`, `tesseract-ocr-heb`, and `poppler-utils`
 *   (pdftoppm) installed on the server (apt install).
 * - Needs `npm install imapflow mailparser` (added to package.json).
 * - New tables: orders, order_email_settings (migration required,
 *   synchronize is off in prod).
 * - Orders live in one fixed storage connection shared by everyone
 *   (ORDERS_STORAGE_CONNECTION_ID env var, defaults to connection id 1)
 *   rather than per-user routing -- set this if connection 1 isn't the
 *   intended one.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderEmailSettings]), StorageModule],
  controllers: [OrderEmailSettingsController, OrdersController],
  providers: [OrdersService, OrderEmailSettingsService, OrderPdfParserService, GmailOrderPollerService],
})
export class OrdersModule {}
