import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from './entities/organization.entity';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization) private readonly orgsRepo: Repository<Organization>,
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
    return this.orgsRepo.save(this.orgsRepo.create({ name: dto.name }));
  }

  async update(id: number, dto: UpdateOrganizationDto): Promise<Organization> {
    const org = await this.findById(id);
    if (dto.name) org.name = dto.name;
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
