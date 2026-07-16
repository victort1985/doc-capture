import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceCall } from '../calls/entities/service-call.entity';
import { CallWorkingSession } from '../calls/entities/call-working-session.entity';
import { FuelRefuel } from '../fleet/entities/fuel-refuel.entity';
import { Order } from '../orders/entities/order.entity';
import { DeliveryNote } from '../delivery-notes/delivery-note.entity';
import { WarehouseTransaction } from '../warehouse/entities/warehouse-transaction.entity';
import { WarehouseTransfer } from '../warehouse/entities/warehouse-transfer.entity';
import { ReportsController } from './reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([
    ServiceCall, CallWorkingSession, FuelRefuel, Order, DeliveryNote, WarehouseTransaction, WarehouseTransfer,
  ])],
  controllers: [ReportsController],
})
export class ReportsModule {}
