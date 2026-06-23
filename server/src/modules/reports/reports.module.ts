import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceCall } from '../calls/entities/service-call.entity';
import { CallWorkingSession } from '../calls/entities/call-working-session.entity';
import { FuelRefuel } from '../fleet/entities/fuel-refuel.entity';
import { ReportsController } from './reports.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceCall, CallWorkingSession, FuelRefuel])],
  controllers: [ReportsController],
})
export class ReportsModule {}
