import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Location } from '../locations/entities/location.entity';
import { ServiceCall } from '../calls/entities/service-call.entity';
import { PortalService } from './portal.service';
import { PortalController } from './portal.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Location, ServiceCall])],
  controllers: [PortalController],
  providers: [PortalService],
})
export class PortalModule {}
