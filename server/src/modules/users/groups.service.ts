import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserGroup } from './entities/user-group.entity';
import { Requester } from './users.service';

@Injectable()
export class GroupsService {
  constructor(@InjectRepository(UserGroup) private readonly groupsRepo: Repository<UserGroup>) {}

  findAll(requester: Requester): Promise<UserGroup[]> {
    return this.groupsRepo.find({
      where: requester.organizationId == null ? {} : { organization: { id: requester.organizationId } },
      order: { name: 'ASC' },
    });
  }

  async findById(id: number, requester: Requester): Promise<UserGroup> {
    const group = await this.groupsRepo.findOne({ where: { id }, relations: ['organization'] });
    if (!group) throw new NotFoundException('Group not found');
    if (requester.organizationId != null && group.organization?.id !== requester.organizationId) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }

  async create(requester: Requester, dto: { name: string; permissions?: Record<string, boolean> }): Promise<UserGroup> {
    const existing = await this.groupsRepo.findOne({
      where: { name: dto.name, ...(requester.organizationId != null ? { organization: { id: requester.organizationId } } : {}) },
    });
    if (existing) throw new ConflictException('A group with this name already exists');
    const group = this.groupsRepo.create({
      name: dto.name,
      permissions: dto.permissions ?? {},
      organization: requester.organizationId != null ? ({ id: requester.organizationId } as any) : undefined,
    });
    return this.groupsRepo.save(group);
  }

  async update(id: number, requester: Requester, dto: { name?: string; permissions?: Record<string, boolean> }): Promise<UserGroup> {
    const group = await this.findById(id, requester);
    if (dto.name !== undefined) group.name = dto.name;
    if (dto.permissions !== undefined) group.permissions = dto.permissions;
    return this.groupsRepo.save(group);
  }

  async remove(id: number, requester: Requester): Promise<void> {
    const group = await this.findById(id, requester);
    await this.groupsRepo.remove(group);
  }
}
