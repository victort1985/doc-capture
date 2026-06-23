import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Vehicle } from './entities/vehicle.entity';
import { FuelRefuel } from './entities/fuel-refuel.entity';
import { VehicleDocument } from './entities/vehicle-document.entity';
import { FleetService } from './fleet.service';
import { FleetController } from './fleet.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [TypeOrmModule.forFeature([Vehicle, FuelRefuel, VehicleDocument]), StorageModule],
  controllers: [FleetController],
  providers: [FleetService],
  exports: [FleetService],
})
export class FleetModule {}
