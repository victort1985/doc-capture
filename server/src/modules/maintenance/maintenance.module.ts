import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MaintenanceContract } from './entities/maintenance-contract.entity';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { CallsModule } from '../calls/calls.module';

@Module({
  imports: [TypeOrmModule.forFeature([MaintenanceContract]), CallsModule],
  controllers: [MaintenanceController],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
