import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceListItem, PriceListItemType } from './entities/price-list-item.entity';

export interface CreatePriceListItemDto {
  name: string;
  type: PriceListItemType;
  price: number;
  notes?: string;
}
export type UpdatePriceListItemDto = Partial<CreatePriceListItemDto>;

@Injectable()
export class PriceListService {
  constructor(
    @InjectRepository(PriceListItem) private readonly repo: Repository<PriceListItem>,
  ) {}

  async findAll(organizationId: number | null, type?: PriceListItemType): Promise<PriceListItem[]> {
    return this.repo.find({
      where: {
        ...(organizationId != null ? { organization: { id: organizationId } } : {}),
        ...(type ? { type } : {}),
      },
      order: { name: 'ASC' },
    });
  }

  async create(organizationId: number | null, dto: CreatePriceListItemDto): Promise<PriceListItem> {
    return this.repo.save(this.repo.create({
      ...dto,
      organization: organizationId != null ? ({ id: organizationId } as any) : undefined,
    }));
  }

  async update(id: number, organizationId: number | null, dto: UpdatePriceListItemDto): Promise<PriceListItem> {
    const item = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!item) throw new NotFoundException('Price list item not found');
    if (organizationId != null && item.organization?.id !== organizationId) throw new NotFoundException('Price list item not found');
    Object.assign(item, dto);
    return this.repo.save(item);
  }

  async remove(id: number, organizationId: number | null): Promise<void> {
    const item = await this.repo.findOne({ where: { id }, relations: ['organization'] });
    if (!item) throw new NotFoundException('Price list item not found');
    if (organizationId != null && item.organization?.id !== organizationId) throw new NotFoundException('Price list item not found');
    await this.repo.remove(item);
  }
}
