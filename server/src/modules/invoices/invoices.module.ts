import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Invoice } from './entities/invoice.entity';
import { InvoiceSettings } from './entities/invoice-settings.entity';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoiceSettingsController } from './invoice-settings.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([Invoice, InvoiceSettings]), UsersModule],
  controllers: [InvoicesController, InvoiceSettingsController],
  providers: [InvoicesService],
})
export class InvoicesModule {}
