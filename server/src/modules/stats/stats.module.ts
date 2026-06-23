import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceCall } from '../calls/entities/service-call.entity';
import { CallWorkingSession } from '../calls/entities/call-working-session.entity';
import { StatsController } from './stats.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ServiceCall, CallWorkingSession])],
  controllers: [StatsController],
})
export class StatsModule {}
