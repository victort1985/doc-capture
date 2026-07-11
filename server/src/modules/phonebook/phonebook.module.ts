import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PhoneBookContact } from './entities/phonebook-contact.entity';
import { GoogleImportSession } from './entities/google-import-session.entity';
import { City } from '../locations/entities/city.entity';
import { Location } from '../locations/entities/location.entity';
import { PhoneBookService } from './phonebook.service';
import { GoogleContactsService } from './google-contacts.service';
import { PhoneBookController } from './phonebook.controller';
import { GoogleContactsController } from './google-contacts.controller';
import { StorageModule } from '../storage/storage.module';
import { LocationsModule } from '../locations/locations.module';
import { TemplatesModule } from '../templates/templates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PhoneBookContact, GoogleImportSession, City, Location]),
    StorageModule,
    LocationsModule,
    TemplatesModule,
  ],
  controllers: [PhoneBookController, GoogleContactsController],
  providers: [PhoneBookService, GoogleContactsService],
})
export class PhoneBookModule {}
