import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_GUARD } from '@nestjs/core';
import { LicenseState } from './entities/license-state.entity';
import { LicenseService } from './license.service';
import { LicenseController } from './license.controller';
import { LicenseGuard } from './license.guard';

@Module({
  imports: [TypeOrmModule.forFeature([LicenseState])],
  controllers: [LicenseController],
  providers: [
    LicenseService,
    { provide: APP_GUARD, useClass: LicenseGuard },
  ],
  exports: [LicenseService],
})
export class LicenseModule {}
