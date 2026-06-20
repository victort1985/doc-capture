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

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly locationsService: LocationsService,
  ) {}

  async findAll(): Promise<User[]> {
    return this.usersRepo.find({ relations: ['city', 'city.region', 'regions'] });
  }

  async findById(id: number): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id }, relations: ['city', 'city.region', 'regions'] });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Used only for login — explicitly pulls passwordHash (hidden by default via select:false). */
  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepo.findOne({
      where: { username },
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

  /** Used for call-notification routing: technicians covering this region, plus anyone marked global. */
  async findUsersForRegion(regionId: number): Promise<User[]> {
    return this.usersRepo
      .createQueryBuilder('user')
      .leftJoin('user.regions', 'region')
      .where('region.id = :regionId', { regionId })
      .orWhere('user.isGlobal = true')
      .getMany();
  }

  private async resolveCityAndRegions(dto: { cityId?: number; regionIds?: number[] }) {
    const city = dto.cityId ? await this.locationsService.findCityById(dto.cityId) : undefined;
    const regions = dto.regionIds ? await this.locationsService.findRegionsByIds(dto.regionIds) : undefined;
    return { city, regions };
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.findByUsername(dto.username);
    if (existing) throw new ConflictException('Username already taken');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const { city, regions } = await this.resolveCityAndRegions(dto);
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
    });
    return this.usersRepo.save(user);
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);
    if (dto.password) {
      user.passwordHash = await bcrypt.hash(dto.password, 10);
    }
    const { city, regions } = await this.resolveCityAndRegions(dto);
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
    });
    return this.usersRepo.save(user);
  }

  async remove(id: number): Promise<void> {
    const user = await this.findById(id);
    await this.usersRepo.remove(user);
  }
}
