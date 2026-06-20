import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PhoneBookContact, ContactCategory } from './entities/phonebook-contact.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { StorageService } from '../storage/storage.service';
import { LocationsService } from '../locations/locations.service';
import { TemplatesService } from '../templates/templates.service';
import { processPhoto } from '../files/processors/photo.processor';
import {
  DEFAULT_PHONEBOOK_PATTERN,
  resolvePhoneBookNamePattern,
} from '../templates/name-pattern.util';

@Injectable()
export class PhoneBookService {
  constructor(
    @InjectRepository(PhoneBookContact)
    private readonly contactsRepo: Repository<PhoneBookContact>,
    private readonly storageService: StorageService,
    private readonly locationsService: LocationsService,
    private readonly templatesService: TemplatesService,
  ) {}

  /** Search-as-you-type by first/last name prefix, optionally filtered by category and/or organization (= a Location, the same directory used for "Место" on calls). */
  findAll(filters: {
    category?: ContactCategory;
    q?: string;
    organizationId?: number;
  }): Promise<PhoneBookContact[]> {
    const qb = this.contactsRepo
      .createQueryBuilder('contact')
      .leftJoinAndSelect('contact.city', 'city')
      .leftJoinAndSelect('city.region', 'region')
      .leftJoinAndSelect('contact.organization', 'organization')
      .orderBy('contact.lastName', 'ASC')
      .addOrderBy('contact.firstName', 'ASC');

    if (filters.category) {
      qb.andWhere('contact.category = :category', { category: filters.category });
    }
    if (filters.organizationId) {
      qb.andWhere('organization.id = :organizationId', { organizationId: filters.organizationId });
    }
    if (filters.q?.trim()) {
      qb.andWhere('(contact.firstName ILIKE :q OR contact.lastName ILIKE :q)', {
        q: `${filters.q.trim()}%`,
      });
    }
    return qb.getMany();
  }

  async findOne(id: number): Promise<PhoneBookContact> {
    const contact = await this.contactsRepo.findOne({
      where: { id },
      relations: ['city', 'city.region', 'organization', 'createdBy'],
    });
    if (!contact) throw new NotFoundException('Contact not found');
    return contact;
  }

  async create(
    userId: number,
    dto: CreateContactDto,
    photo?: { buffer: Buffer; mimetype: string },
  ): Promise<PhoneBookContact> {
    const city = dto.cityId ? await this.locationsService.findCityById(dto.cityId) : undefined;
    const organization = dto.organizationId
      ? await this.locationsService.findLocationById(dto.organizationId)
      : undefined;

    const contact = this.contactsRepo.create({
      category: dto.category,
      firstName: dto.firstName,
      lastName: dto.lastName,
      city,
      organization,
      position: dto.position,
      phone: dto.phone,
      email: dto.email,
      notes: dto.notes,
      createdBy: { id: userId } as any,
    });
    const saved = await this.contactsRepo.save(contact);

    await this.writeContactFiles(saved, userId, photo);

    return this.findOne(saved.id);
  }

  async update(
    id: number,
    dto: UpdateContactDto,
    userId: number,
    photo?: { buffer: Buffer; mimetype: string },
  ): Promise<PhoneBookContact> {
    const contact = await this.findOne(id);
    const city = dto.cityId !== undefined
      ? (dto.cityId ? await this.locationsService.findCityById(dto.cityId) : undefined)
      : contact.city;
    const organization = dto.organizationId !== undefined
      ? (dto.organizationId ? await this.locationsService.findLocationById(dto.organizationId) : undefined)
      : contact.organization;

    Object.assign(contact, {
      category: dto.category ?? contact.category,
      firstName: dto.firstName ?? contact.firstName,
      lastName: dto.lastName ?? contact.lastName,
      city,
      organization,
      position: dto.position ?? contact.position,
      phone: dto.phone ?? contact.phone,
      email: dto.email ?? contact.email,
      notes: dto.notes ?? contact.notes,
    });
    const saved = await this.contactsRepo.save(contact);

    // Re-write the mirror file(s) too — the filename pattern depends on
    // fields that may have just changed (organization/city/position/name).
    await this.writeContactFiles(saved, userId, photo);

    return this.findOne(saved.id);
  }

  async remove(id: number): Promise<void> {
    const contact = await this.findOne(id);
    await this.contactsRepo.remove(contact);
  }

  /**
   * Writes the contact's JSON data file (always) and photo (if provided)
   * into PhoneBook/ on the editing user's configured storage connection,
   * named per the admin-configurable pattern (Templates →
   * appliesTo=phonebook), falling back to a sane default if none is set.
   */
  private async writeContactFiles(
    contact: PhoneBookContact,
    userId: number,
    photo?: { buffer: Buffer; mimetype: string },
  ): Promise<void> {
    const settings = await this.storageService.getClientSettings(userId);
    const connectionId = settings?.documentStorageConnection?.id;
    if (!connectionId) return; // no storage configured for this user — DB record still saved, just no file mirror

    const template = await this.templatesService.findPhoneBookTemplate();
    const pattern = template?.pattern || DEFAULT_PHONEBOOK_PATTERN;
    const baseName = resolvePhoneBookNamePattern(pattern, {
      organization: contact.organization?.name || '',
      city: contact.city?.name || '',
      position: contact.position || '',
      firstName: contact.firstName,
      lastName: contact.lastName,
      year: contact.createdAt.getFullYear(),
    });

    const { adapter } = await this.storageService.getAdapterWithMeta(connectionId);

    const dataRelativePath = `PhoneBook/${baseName}.json`;
    const dataBuffer = Buffer.from(
      JSON.stringify(
        {
          category: contact.category,
          firstName: contact.firstName,
          lastName: contact.lastName,
          city: contact.city?.name,
          region: contact.city?.region?.name,
          organization: contact.organization?.name,
          position: contact.position,
          phone: contact.phone,
          email: contact.email,
          notes: contact.notes,
        },
        null,
        2,
      ),
    );
    await adapter.write(dataRelativePath, dataBuffer);
    contact.dataRelativePath = dataRelativePath;
    contact.dataStorageConnection = { id: connectionId } as any;

    if (photo) {
      const processed = await processPhoto(photo.buffer);
      const photoRelativePath = `PhoneBook/${baseName}.jpg`;
      await adapter.write(photoRelativePath, processed);
      contact.photoRelativePath = photoRelativePath;
      contact.photoStorageConnection = { id: connectionId } as any;
    }

    await this.contactsRepo.save(contact);
  }
}
