import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehouseCategory } from './entities/warehouse-category.entity';
import { WarehouseItem } from './entities/warehouse-item.entity';
import { WarehouseTransaction } from './entities/warehouse-transaction.entity';
import { WarehouseRepair } from './entities/warehouse-repair.entity';
import { WarehouseTransfer } from './entities/warehouse-transfer.entity';
import { ServiceCall } from '../calls/entities/service-call.entity';
import { WarehouseCostSettings } from './entities/warehouse-cost-settings.entity';
import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';
import { WarehouseCogsService } from './warehouse-cogs.service';

@Module({
  imports: [TypeOrmModule.forFeature([WarehouseCategory, WarehouseItem, WarehouseTransaction, WarehouseRepair, WarehouseTransfer, ServiceCall, WarehouseCostSettings])],
  controllers: [WarehouseController],
  providers: [WarehouseService, WarehouseCogsService],
  exports: [WarehouseService],
})
export class WarehouseModule {}
