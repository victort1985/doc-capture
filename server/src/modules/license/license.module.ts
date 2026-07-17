import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { LicenseState } from './entities/license-state.entity';
import { RegisteredDevice } from './entities/registered-device.entity';
import { LicenseService } from './license.service';
import { LicenseController } from './license.controller';
import { LicenseGuard } from './license.guard';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LicenseState, RegisteredDevice])],
  controllers: [LicenseController, DevicesController],
  providers: [
    LicenseService,
    DevicesService,
    { provide: APP_GUARD, useClass: LicenseGuard },
  ],
  exports: [LicenseService, DevicesService],
})
export class LicenseModule {}
