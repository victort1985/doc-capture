import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { UserGroup } from './entities/user-group.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { LocationsService } from '../locations/locations.service';
import { OrganizationsService } from '../organizations/organizations.service';

/** Whoever is making the request — derived from their JWT, never trusted from the request body. */
export interface Requester {
  organizationId: number | null;
}

const RELATIONS = ['city', 'city.region', 'regions', 'organization', 'group'];

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    @InjectRepository(UserGroup) private readonly groupsRepo: Repository<UserGroup>,
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

  /** Re-verifies a user's own password — used for high-stakes confirm
   * dialogs (e.g. locking quote/invoice numbering permanently) where a
   * valid session isn't considered enough on its own. */
  async verifyPassword(userId: number, password: string): Promise<boolean> {
    const user = await this.usersRepo.findOne({ where: { id: userId }, select: { id: true, passwordHash: true } });
    if (!user) return false;
    return bcrypt.compare(password, user.passwordHash);
  }

  /** Self-service password change — always requires the CURRENT
   * password (unlike an admin resetting someone else's password via
   * update()), regardless of role. */
  async changeOwnPassword(userId: number, currentPassword: string, newPassword: string): Promise<void> {
    const ok = await this.verifyPassword(userId, currentPassword);
    if (!ok) throw new BadRequestException('Current password is incorrect.');
    if (!newPassword || newPassword.length < 8) throw new BadRequestException('New password must be at least 8 characters.');
    await this.usersRepo.update(userId, { passwordHash: await bcrypt.hash(newPassword, 10) });
  }

  async markSetupWizardCompleted(userId: number): Promise<void> {
    await this.usersRepo.update(userId, { setupWizardCompleted: true });
  }

  async acceptTos(userId: number, version: string): Promise<void> {
    await this.usersRepo.update(userId, { tosAcceptedAt: new Date(), tosAcceptedVersion: version });
  }

  /** Used only for login — explicitly pulls passwordHash (hidden by default via select:false). */
  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { username },
      relations: ['organization', 'group'],
      select: {
        id: true,
        username: true,
        passwordHash: true,
        role: true,
        language: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        firstName: true,
        lastName: true,
        allowedOrganizationIds: true,
        permissions: true,
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

  private async resolveGroup(groupId: number | null | undefined): Promise<UserGroup | null | undefined> {
    if (groupId === undefined) return undefined; // not touched
    if (groupId === null) return null; // explicitly cleared
    const group = await this.groupsRepo.findOne({ where: { id: groupId } });
    if (!group) throw new NotFoundException('Group not found');
    return group;
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
    let group = await this.resolveGroup(dto.groupId);
    // Demo/sandbox organizations: anyone signing up afterwards (not
    // set up directly by the super-admin) lands in the "Users" group
    // rather than getting full default role permissions — the
    // super-admin controls what that group can actually do via the
    // normal Groups page. Only kicks in when the caller didn't
    // explicitly pick a group.
    if (group === undefined && organization?.isDemoMode) {
      group = await this.groupsRepo.findOne({ where: { name: 'Users', organization: { id: organization.id } } });
    }
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
      group: group ?? undefined,
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
    const group = await this.resolveGroup(dto.groupId);
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
      group: group !== undefined ? group : user.group,
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
