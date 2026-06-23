import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehouseCategory } from './entities/warehouse-category.entity';
import { WarehouseItem } from './entities/warehouse-item.entity';
import { WarehouseTransaction } from './entities/warehouse-transaction.entity';
import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WarehouseCategory, WarehouseItem, WarehouseTransaction])],
  controllers: [WarehouseController],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class WarehouseModule {}
