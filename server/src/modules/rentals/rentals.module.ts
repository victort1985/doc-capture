import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Rental } from './entities/rental.entity';
import { RentalsService } from './rentals.service';
import { RentalsController } from './rentals.controller';
import { WarehouseModule } from '../warehouse/warehouse.module';

@Module({
  imports: [TypeOrmModule.forFeature([Rental]), WarehouseModule],
  providers: [RentalsService],
  controllers: [RentalsController],
})
export class RentalsModule {}
