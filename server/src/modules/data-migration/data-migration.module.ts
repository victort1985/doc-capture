import { Module } from '@nestjs/common';
import { DataMigrationService } from './data-migration.service';
import { DataMigrationController } from './data-migration.controller';
import { MigrationJobsService } from './migration-jobs.service';
import { PhoneBookModule } from '../phonebook/phonebook.module';
import { WarehouseModule } from '../warehouse/warehouse.module';

@Module({
  imports: [PhoneBookModule, WarehouseModule],
  controllers: [DataMigrationController],
  providers: [DataMigrationService, MigrationJobsService],
})
export class DataMigrationModule {}
