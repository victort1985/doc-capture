import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OverdueReminderSettings } from './entities/overdue-reminder-settings.entity';
import { OverdueReminderLog } from './entities/overdue-reminder-log.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Payment } from '../payments/entities/payment.entity';
import { CreditNote } from '../credit-notes/entities/credit-note.entity';
import { OverdueReminderService } from './overdue-reminder.service';
import { OverdueReminderController } from './overdue-reminder.controller';
import { DocumentEmailModule } from '../document-email/document-email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([OverdueReminderSettings, OverdueReminderLog, Invoice, Payment, CreditNote]),
    DocumentEmailModule,
  ],
  controllers: [OverdueReminderController],
  providers: [OverdueReminderService],
})
export class OverdueReminderModule {}
