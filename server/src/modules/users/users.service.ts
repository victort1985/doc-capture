import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LocationsService } from '../locations/locations.service';
import { OrganizationsService } from '../organizations/organizations.service';

/** Whoever is making the request — derived from their JWT, never trusted from the request body. */
export interface Requester {
  organizationId: number | null;
}

const RELATIONS = ['city', 'city.region', 'regions', 'organization'];

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly locationsService: LocationsService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  /** Super-admin (organizationId null) sees every user; an org-scoped admin sees only their own organization's. */
  async findAll(requester: Requester): Promise<User[]> {
    return this.usersRepo.find({
      relations: RELATIONS,
      where: requester.organizationId == null ? {} : { organization: { id: requester.organizationId } },
    });
  }

  async findById(id: number, requester?: Requester): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id }, relations: RELATIONS });
    if (!user) throw new NotFoundException('User not found');
    // 404 rather than 403 for an out-of-scope user — doesn't confirm or
    // deny that a user with this id exists in someone else's organization.
    if (requester && requester.organizationId != null && user.organization?.id !== requester.organizationId) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /** Used only for login — explicitly pulls passwordHash (hidden by default via select:false). */
  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { username },
      relations: ['organization'],
      select: {
        id: true,
        username: true,
        passwordHash: true,
        role: true,
        language: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** Used for call-notification routing: technicians covering this region (within the given organization, if any), plus anyone marked global. */
  /**
   * Used for call-notification routing: technicians covering this region
   * (within the given organization, if any), plus anyone marked global.
   *
   * A user with no organization assigned matches regardless of the
   * call's organization — same "null = shared, not off-limits" rule
   * applied to Locations/Calls/PhoneBookContact, and specifically fixes
   * a real case: a user marked isGlobal=true but never assigned to an
   * organization (easy oversight — "global" can feel like it should be
   * above organizational scoping) was being silently excluded from
   * every single call's notifications, since `user.organizationId =
   * :organizationId` is never true when the left side is NULL.
   */
  async findUsersForRegion(regionId: number, organizationId: number | null): Promise<User[]> {
    const qb = this.usersRepo
      .createQueryBuilder('user')
      .leftJoin('user.regions', 'region')
      .where('(region.id = :regionId OR user.isGlobal = true)', { regionId });
    if (organizationId != null) {
      qb.andWhere('(user.organizationId = :organizationId OR user.organizationId IS NULL)', { organizationId });
    }
    return qb.getMany();
  }

  private async resolveCityAndRegions(dto: { cityId?: number; regionIds?: number[] }) {
    const city = dto.cityId ? await this.locationsService.findCityById(dto.cityId) : undefined;
    const regions = dto.regionIds ? await this.locationsService.findRegionsByIds(dto.regionIds) : undefined;
    return { city, regions };
  }

  /**
   * Resolves which organization a new/updated user should belong to.
   * An org-scoped admin can only ever create/edit users within their own
   * organization — any organizationId they pass in the DTO is ignored
   * in favor of their own, rather than trusting client input for a
   * security boundary. Only the super-admin can assign an arbitrary
   * organization (or none, to create another super-admin).
   */
  private async resolveOrganization(requester: Requester, dto: { organizationId?: number }) {
    if (requester.organizationId != null) {
      return this.organizationsService.findById(requester.organizationId);
    }
    return dto.organizationId ? this.organizationsService.findById(dto.organizationId) : undefined;
  }

  async create(requester: Requester, dto: CreateUserDto): Promise<User> {
    const existing = await this.findByUsername(dto.username);
    if (existing) throw new ConflictException('Username already taken');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const { city, regions } = await this.resolveCityAndRegions(dto);
    const organization = await this.resolveOrganization(requester, dto);
    const user = this.usersRepo.create({
      username: dto.username,
      email: dto.email,
      passwordHash,
      role: dto.role,
      language: dto.language,
      isActive: dto.isActive ?? true,
      firstName: dto.firstName,
      lastName: dto.lastName,
      specialization: dto.specialization,
      phone: dto.phone,
      city,
      regions,
      isGlobal: dto.isGlobal ?? false,
      organization,
      allowedOrganizationIds: dto.allowedOrganizationIds ?? [],
      permissions: dto.permissions ?? {},
    });
    return this.usersRepo.save(user);
  }

  async update(id: number, requester: Requester, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id, requester);
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    const { city, regions } = await this.resolveCityAndRegions(dto);
    const organization =
      dto.organizationId !== undefined || requester.organizationId != null
        ? await this.resolveOrganization(requester, dto)
        : user.organization;
    Object.assign(user, {
      username: dto.username ?? user.username,
      email: dto.email ?? user.email,
      role: dto.role ?? user.role,
      language: dto.language ?? user.language,
      isActive: dto.isActive ?? user.isActive,
      firstName: dto.firstName ?? user.firstName,
      lastName: dto.lastName ?? user.lastName,
      specialization: dto.specialization ?? user.specialization,
      phone: dto.phone ?? user.phone,
      city: dto.cityId !== undefined ? city : user.city,
      regions: dto.regionIds !== undefined ? regions : user.regions,
      isGlobal: dto.isGlobal ?? user.isGlobal,
      organization,
      allowedOrganizationIds: dto.allowedOrganizationIds ?? user.allowedOrganizationIds,
      permissions: dto.permissions ? { ...user.permissions, ...dto.permissions } : user.permissions,
    });
    return this.usersRepo.save(user);
  }

  async remove(id: number, requester: Requester): Promise<void> {
    const user = await this.findById(id, requester);
    await this.usersRepo.remove(user);
  }

  async setPushToken(userId: number, token: string, platform: string): Promise<void> {
    await this.usersRepo.update(userId, { pushToken: token, pushPlatform: platform });
  }

  async clearPushToken(userId: number): Promise<void> {
    await this.usersRepo.update(userId, { pushToken: null as any, pushPlatform: null as any });
  }
}
