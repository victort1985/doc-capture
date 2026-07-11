import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { PhoneBookContact, ContactCategory } from './entities/phonebook-contact.entity';
import { City } from '../locations/entities/city.entity';
import { Location } from '../locations/entities/location.entity';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ParsedContactDto } from './dto/import-contacts.dto';
import { StorageService } from '../storage/storage.service';
import { LocationsService } from '../locations/locations.service';
import { TemplatesService } from '../templates/templates.service';
import { processPhoto } from '../files/processors/photo.processor';
import { parseVCard } from './vcard-parser.util';
import { ParsedContact } from './phonebook.types';
import {
  DEFAULT_PHONEBOOK_PATTERN,
  resolvePhoneBookNamePattern,
} from '../templates/name-pattern.util';

@Injectable()
export class PhoneBookService {
  constructor(
    @InjectRepository(PhoneBookContact)
    private readonly contactsRepo: Repository<PhoneBookContact>,
    @InjectRepository(City)
    private readonly citiesRepo: Repository<City>,
    @InjectRepository(Location)
    private readonly locationsRepo: Repository<Location>,
    private readonly storageService: StorageService,
    private readonly locationsService: LocationsService,
    private readonly templatesService: TemplatesService,
  ) {}

  /**
   * Search-as-you-type by first/last name prefix, optionally filtered by
   * category and/or organization (= a Location — "people who work at
   * this place", the business field, NOT the multi-tenant boundary).
   * `tenantId` is the multi-tenant scope: null only for the super-admin
   * (sees every organization's contacts); otherwise restricted to that
   * tenant's own contacts regardless of what else is searched for.
   */
  findAll(filters: {
    category?: ContactCategory;
    q?: string;
    organizationId?: number;
    tenantId?: number | null;
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
    if (filters.tenantId != null) {
      qb.andWhere('(contact.tenantId = :tenantId OR contact.tenantId IS NULL)', { tenantId: filters.tenantId });
    }
    if (filters.q?.trim()) {
      qb.andWhere('(contact.firstName ILIKE :q OR contact.lastName ILIKE :q)', {
        q: `${filters.q.trim()}%`,
      });
    }
    return qb.getMany();
  }

  /** @param tenantId If provided, 404s unless the contact belongs to this tenant OR has no tenant at all (legacy contact, treated as shared — same reasoning as Location). */
  async findOne(id: number, tenantId?: number | null): Promise<PhoneBookContact> {
    const contact = await this.contactsRepo.findOne({
      where: { id },
      relations: ['city', 'city.region', 'organization', 'createdBy', 'tenant'],
    });
    if (!contact) throw new NotFoundException('Contact not found');
    if (tenantId != null && contact.tenant != null && contact.tenant.id !== tenantId) {
      throw new NotFoundException('Contact not found');
    }
    return contact;
  }

  async create(
    userId: number,
    tenantId: number | null,
    dto: CreateContactDto,
    photo?: { buffer: Buffer; mimetype: string },
  ): Promise<PhoneBookContact> {
    const city = dto.cityId ? await this.locationsService.findCityById(dto.cityId) : undefined;
    const organization = dto.organizationId
      ? await this.locationsService.findLocationById(dto.organizationId, tenantId)
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
      tenant: tenantId != null ? ({ id: tenantId } as any) : undefined,
    });
    const saved = await this.contactsRepo.save(contact);

    await this.writeContactFiles(saved, userId, photo);

    return this.findOne(saved.id);
  }

  async update(
    id: number,
    tenantId: number | null,
    dto: UpdateContactDto,
    userId: number,
    photo?: { buffer: Buffer; mimetype: string },
  ): Promise<PhoneBookContact> {
    const contact = await this.findOne(id, tenantId);
    const city = dto.cityId !== undefined
      ? (dto.cityId ? await this.locationsService.findCityById(dto.cityId) : undefined)
      : contact.city;
    const organization = dto.organizationId !== undefined
      ? (dto.organizationId ? await this.locationsService.findLocationById(dto.organizationId, tenantId) : undefined)
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

  async remove(id: number, tenantId: number | null): Promise<void> {
    const contact = await this.findOne(id, tenantId);
    await this.contactsRepo.remove(contact);
  }

  /** Streams a contact's photo back. @param tenantId same out-of-scope-is-404 pattern as the other methods (null-tenant contacts are treated as shared, not off-limits). */
  async downloadPhoto(id: number, tenantId?: number | null): Promise<{ buffer: Buffer; mimetype: string }> {
    const contact = await this.contactsRepo.findOne({
      where: { id },
      relations: ['photoStorageConnection', 'tenant'],
    });
    if (tenantId != null && contact?.tenant != null && contact.tenant.id !== tenantId) {
      throw new NotFoundException('This contact has no photo');
    }
    if (!contact?.photoRelativePath || !contact.photoStorageConnection) {
      throw new NotFoundException('This contact has no photo');
    }
    const adapter = await this.storageService.getAdapter(contact.photoStorageConnection.id);
    const bytes = await adapter.read(contact.photoRelativePath);
    return { buffer: bytes, mimetype: 'image/jpeg' };
  }

  /**
   * Parses an uploaded .vcf file into a preview list — nothing is saved
   * yet. The admin panel shows this as a checkbox table so the admin
   * can pick which contacts actually get imported (spec: "не все
   * контакты, а выборочно").
   */
  parseVCardFile(buffer: Buffer): ParsedContact[] {
    return parseVCard(buffer.toString('utf-8'));
  }

  /**
   * Creates a PhoneBookContact for each of the admin-selected parsed
   * contacts. vCard has no equivalent of this app's category
   * (client/technician/supplier), so one category applies to the whole
   * batch. city/organization are matched by name against existing
   * records (case-insensitive) rather than auto-creating new
   * City/Location entries from arbitrary imported text, which could
   * otherwise pollute that shared, curated directory with near-duplicate
   * or malformed entries — an unmatched name is preserved in Notes
   * instead of silently dropped, so nothing from the vCard is lost even
   * without a match.
   */
  async importContacts(
    userId: number,
    tenantId: number | null,
    category: ContactCategory,
    contacts: ParsedContactDto[],
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;

    for (const c of contacts) {
      if (!c.phone?.trim()) {
        // Schema requires a phone number — vCard entries without one
        // (email-only contacts, for instance) can't become a valid
        // record here.
        skipped++;
        continue;
      }

      const city = c.city ? await this.findCityByName(c.city) : undefined;
      const organization = c.organization ? await this.findLocationByName(c.organization, tenantId) : undefined;

      let notes = c.notes;
      if (c.organization && !organization) {
        notes = [notes, `Организация (из импорта): ${c.organization}`].filter(Boolean).join('\n');
      }
      if (c.city && !city) {
        notes = [notes, `Город (из импорта): ${c.city}`].filter(Boolean).join('\n');
      }

      const contact = this.contactsRepo.create({
        category,
        firstName: c.firstName,
        lastName: c.lastName || '',
        city,
        organization,
        phone: c.phone,
        email: c.email,
        notes,
        createdBy: { id: userId } as any,
        tenant: tenantId != null ? ({ id: tenantId } as any) : undefined,
      });
      const saved = await this.contactsRepo.save(contact);
      await this.writeContactFiles(saved, userId);
      imported++;
    }

    return { imported, skipped };
  }

  private async findCityByName(name: string): Promise<City | undefined> {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    return (await this.citiesRepo.findOne({ where: { name: ILike(trimmed) } })) ?? undefined;
  }

  private async findLocationByName(name: string, tenantId: number | null): Promise<Location | undefined> {
    const trimmed = name.trim();
    if (!trimmed) return undefined;
    const qb = this.locationsRepo.createQueryBuilder('l').where('l.name ILIKE :name', { name: trimmed });
    if (tenantId != null) {
      qb.andWhere('(l."organizationId" = :tenantId OR l."organizationId" IS NULL)', { tenantId });
    }
    return (await qb.getOne()) ?? undefined;
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
    // Deliberately not applying encryptAtRest here, unlike calls/document
    // uploads: phone book entries are directory data (names, phone
    // numbers, job titles), not the sensitive scanned documents the
    // encryption setting was built to protect, so reading them back
    // doesn't go through a decrypt step either (see downloadPhoto below).

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
