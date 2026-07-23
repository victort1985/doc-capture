import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quote } from '../quotes/entities/quote.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderChainService } from './order-chain.service';
import { OrderChainController } from './order-chain.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Quote, Invoice, DeliveryNote, Order])],
  controllers: [OrderChainController],
  providers: [OrderChainService],
  exports: [OrderChainService],
})
export class OrderChainModule {}
