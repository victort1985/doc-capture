import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PhoneBookContact } from './entities/phonebook-contact.entity';
import { PhoneBookService } from './phonebook.service';
import { PhoneBookController } from './phonebook.controller';
import { StorageModule } from '../storage/storage.module';
import { LocationsModule } from '../locations/locations.module';
import { TemplatesModule } from '../templates/templates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PhoneBookContact]),
    StorageModule,
    LocationsModule,
    TemplatesModule,
  ],
  controllers: [PhoneBookController],
  providers: [PhoneBookService],
})
export class PhoneBookModule {}
