import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Region } from './entities/region.entity';
import { City } from './entities/city.entity';
import { Location } from './entities/location.entity';
import { CreateRegionDto } from './dto/create-region.dto';
import { CreateCityDto } from './dto/create-city.dto';
import { CreateLocationDto } from './dto/create-location.dto';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Region) private readonly regionsRepo: Repository<Region>,
    @InjectRepository(City) private readonly citiesRepo: Repository<City>,
    @InjectRepository(Location) private readonly locationsRepo: Repository<Location>,
  ) {}

  // --- Regions ---

  findAllRegions(): Promise<Region[]> {
    return this.regionsRepo.find({ order: { name: 'ASC' } });
  }

  async createRegion(dto: CreateRegionDto): Promise<Region> {
    const existing = await this.regionsRepo.findOne({ where: { name: dto.name } });
    if (existing) throw new ConflictException('A region with this name already exists');
    return this.regionsRepo.save(this.regionsRepo.create({ name: dto.name }));
  }

  async deleteRegion(id: number): Promise<void> {
    const result = await this.regionsRepo.delete(id);
    if (!result.affected) throw new NotFoundException('Region not found');
  }

  // --- Cities ---

  /** Search-as-you-type by prefix, optionally narrowed to a region. */
  findCities(query?: string, regionId?: number): Promise<City[]> {
    const qb = this.citiesRepo
      .createQueryBuilder('city')
      .leftJoinAndSelect('city.region', 'region')
      .orderBy('city.name', 'ASC')
      .take(50);
    if (query?.trim()) {
      qb.andWhere('city.name ILIKE :query', { query: `${query.trim()}%` });
    }
    if (regionId) {
      qb.andWhere('region.id = :regionId', { regionId });
    }
    return qb.getMany();
  }

  async createCity(dto: CreateCityDto): Promise<City> {
    const region = await this.regionsRepo.findOne({ where: { id: dto.regionId } });
    if (!region) throw new NotFoundException('Region not found');
    const existing = await this.citiesRepo.findOne({
      where: { name: dto.name, region: { id: dto.regionId } },
    });
    if (existing) throw new ConflictException('A city with this name already exists in this region');
    return this.citiesRepo.save(this.citiesRepo.create({ name: dto.name, region }));
  }

  async deleteCity(id: number): Promise<void> {
    const result = await this.citiesRepo.delete(id);
    if (!result.affected) throw new NotFoundException('City not found');
  }

  async findCityById(id: number): Promise<City> {
    const city = await this.citiesRepo.findOne({ where: { id }, relations: ['region'] });
    if (!city) throw new NotFoundException('City not found');
    return city;
  }

  /** Used when assigning regions to a technician — returns only the ones that exist, silently ignoring stale/invalid ids. */
  findRegionsByIds(ids: number[]): Promise<Region[]> {
    if (!ids?.length) return Promise.resolve([]);
    return this.regionsRepo.find({ where: { id: In(ids) } });
  }

  // --- Locations ("place" in calls/inventory, "organization" in phone book) ---

  /** Search-as-you-type by prefix, optionally narrowed to a city. Scoped to the requester's organization unless they're the super-admin. */
  findLocations(query?: string, cityId?: number, organizationId?: number | null): Promise<Location[]> {
    const qb = this.locationsRepo
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.city', 'city')
      .leftJoinAndSelect('city.region', 'region')
      .orderBy('location.name', 'ASC')
      .take(50);
    if (query?.trim()) {
      qb.andWhere('location.name ILIKE :query', { query: `${query.trim()}%` });
    }
    if (cityId) {
      qb.andWhere('city.id = :cityId', { cityId });
    }
    if (organizationId != null) {
      qb.andWhere('location.organizationId = :organizationId', { organizationId });
    }
    return qb.getMany();
  }

  /**
   * @param organizationId If provided, the lookup 404s unless the location
   * belongs to this organization — used when resolving a client-supplied
   * locationId (call creation, phone book contact's organization field)
   * so one tenant can't reference another's location by guessing an id.
   * Omit for trusted internal lookups where the id is already known-valid.
   */
  async findLocationById(id: number, organizationId?: number | null): Promise<Location> {
    const location = await this.locationsRepo.findOne({
      where: { id },
      relations: ['city', 'city.region', 'organization'],
    });
    if (!location) throw new NotFoundException('Location not found');
    if (organizationId != null && location.organization?.id !== organizationId) {
      throw new NotFoundException('Location not found');
    }
    return location;
  }

  async createLocation(dto: CreateLocationDto, organizationId?: number | null): Promise<Location> {
    const city = await this.citiesRepo.findOne({ where: { id: dto.cityId } });
    if (!city) throw new NotFoundException('City not found');
    const existing = await this.locationsRepo.findOne({
      where: {
        name: dto.name,
        city: { id: dto.cityId },
        organization: organizationId != null ? { id: organizationId } : IsNull(),
      },
    });
    if (existing) throw new ConflictException('A location with this name already exists in this city');
    return this.locationsRepo.save(
      this.locationsRepo.create({
        name: dto.name,
        city,
        organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
      }),
    );
  }

  async deleteLocation(id: number): Promise<void> {
    const result = await this.locationsRepo.delete(id);
    if (!result.affected) throw new NotFoundException('Location not found');
  }
}
