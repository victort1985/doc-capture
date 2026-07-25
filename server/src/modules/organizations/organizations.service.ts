import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { UserGroup } from '../users/entities/user-group.entity';

/** Requirement #20 ("бухгалтер, кассир, менеджер, директор,
 * администратор с разграничением прав") — "администратор" is the
 * existing UserRole.ADMIN, not a group; these four are seeded as
 * ready-made Groups (see UserGroup) on every new organization so an
 * admin has sensible starting points to assign users into instead of
 * building permission sets from scratch. Nothing stops renaming/
 * editing/deleting them afterward — they're just a starting point,
 * not a fixed system concept. */
const DEFAULT_ROLE_GROUPS: { name: string; permissions: Record<string, boolean> }[] = [
  {
    name: 'Бухгалтер',
    permissions: {
      'office.delivery_notes': true, 'office.quotes': true, 'office.invoices': true, 'office.orders': true, 'office.payments': true,
      'reports.work': true, 'reports.fuel': true, 'calls.stats': true,
    },
  },
  {
    name: 'Кассир',
    permissions: { 'office.invoices': true, 'office.payments': true, 'calendar.view': true },
  },
  {
    name: 'Менеджер',
    permissions: {
      'calls.create': true, 'calls.edit': true, 'calls.close': true, 'calls.stats': true,
      'calendar.view': true, 'calendar.edit': true,
      'fleet.view': true, 'fleet.refuel': true,
      'warehouse.view': true, 'warehouse.transactions': true,
      'office.quotes': true, 'office.orders': true, 'office.delivery_notes': true,
      'phonebook.edit': true,
    },
  },
  {
    name: 'Директор',
    permissions: {
      'calls.create': true, 'calls.edit': true, 'calls.delete': true, 'calls.close': true, 'calls.stats': true,
      'calendar.view': true, 'calendar.edit': true, 'calendar.all_orgs': true,
      'fleet.view': true, 'fleet.refuel': true, 'fleet.manage': true, 'fleet.documents': true,
      'warehouse.view': true, 'warehouse.transactions': true, 'warehouse.manage': true,
      'reports.work': true, 'reports.fuel': true,
      'phonebook.edit': true, 'orgs.switch': true,
      'office.delivery_notes': true, 'office.quotes': true, 'office.invoices': true, 'office.orders': true, 'office.payments': true,
    },
  },
];

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private readonly orgsRepo: Repository<Organization>,
    @InjectRepository(UserGroup) private readonly groupsRepo: Repository<UserGroup>,
  ) {}

  findAll(): Promise<Organization[]> {
    // logoData is select:false on the entity (avoid loading every org's
    // logo bytes just to list them) — see downloadLogo for the real fetch.
    return this.orgsRepo.find({ order: { name: 'ASC' } });
  }

  async findById(id: number): Promise<Organization> {
    const org = await this.orgsRepo.findOne({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const existing = await this.orgsRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException('An organization with this name already exists');
    const org = await this.orgsRepo.save(this.orgsRepo.create({ name: dto.name, businessType: dto.businessType, taxId: dto.taxId }));
    await this.seedDefaultGroups(org.id);
    return org;
  }

  /** Also callable directly (POST /organizations/:id/seed-default-
   * groups) for organizations that existed before this feature was
   * added and never got these groups automatically. Skips any name
   * that's already present for the org, so calling it twice is safe. */
  async seedDefaultGroups(organizationId: number): Promise<UserGroup[]> {
    const existingNames = new Set(
      (await this.groupsRepo.find({ where: { organization: { id: organizationId } } })).map((g) => g.name),
    );
    const toCreate = DEFAULT_ROLE_GROUPS.filter((g) => !existingNames.has(g.name));
    if (toCreate.length === 0) return [];
    return this.groupsRepo.save(
      toCreate.map((g) => this.groupsRepo.create({ name: g.name, permissions: g.permissions, organization: { id: organizationId } as any })),
    );
  }

  async update(id: number, dto: UpdateOrganizationDto): Promise<Organization> {
    const org = await this.findById(id);
    if (dto.name) org.name = dto.name;
    if (dto.businessType !== undefined) org.businessType = dto.businessType;
    if (dto.taxId !== undefined) org.taxId = dto.taxId;
    return this.orgsRepo.save(org);
  }

  async remove(id: number): Promise<void> {
    const org = await this.findById(id);
    await this.orgsRepo.remove(org);
  }

  async setLogo(id: number, data: Buffer, mimetype: string): Promise<void> {
    await this.findById(id); // 404s cleanly if it doesn't exist
    await this.orgsRepo.update(id, { logoData: data, logoMimetype: mimetype });
  }

  async getLogo(id: number): Promise<{ data: Buffer; mimetype: string } | null> {
    const org = await this.orgsRepo.findOne({
      where: { id },
      select: ['id', 'logoData', 'logoMimetype'],
    });
    if (!org?.logoData) return null;
    return { data: org.logoData, mimetype: org.logoMimetype || 'image/png' };
  }
}
