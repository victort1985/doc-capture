import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { FileTemplate, TemplateAppliesTo } from './entities/file-template.entity';
import { FileRecord } from './entities/file-record.entity';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(FileTemplate)
    private readonly templatesRepo: Repository<FileTemplate>,
    @InjectRepository(FileRecord)
    private readonly recordsRepo: Repository<FileRecord>,
  ) {}

  findAll(): Promise<FileTemplate[]> {
    return this.templatesRepo.find();
  }

  async findOne(id: number): Promise<FileTemplate> {
    const tpl = await this.templatesRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException('Template not found');
    return tpl;
  }

  create(dto: CreateTemplateDto): Promise<FileTemplate> {
    return this.templatesRepo.save(
      this.templatesRepo.create({
        name: dto.name,
        pattern: dto.pattern,
        appliesTo: dto.appliesTo,
        user: dto.userId ? ({ id: dto.userId } as any) : undefined,
      }),
    );
  }

  async update(id: number, dto: UpdateTemplateDto): Promise<FileTemplate> {
    const tpl = await this.findOne(id);
    Object.assign(tpl, {
      name: dto.name ?? tpl.name,
      pattern: dto.pattern ?? tpl.pattern,
      appliesTo: dto.appliesTo ?? tpl.appliesTo,
    });
    return this.templatesRepo.save(tpl);
  }

  async remove(id: number): Promise<void> {
    const tpl = await this.findOne(id);
    await this.templatesRepo.remove(tpl);
  }

  /**
   * Picks the template that should actually govern a given upload.
   * Preference order: this user's own template for this exact docType >
   * this user's "both" template > a global (no-owner) template for this
   * exact docType > a global "both" template > undefined (caller falls
   * back to a hardcoded default pattern).
   */
  async findApplicableTemplate(
    userId: number,
    docType: TemplateAppliesTo.DOCUMENT | TemplateAppliesTo.PHOTO,
  ): Promise<FileTemplate | undefined> {
    const candidates = await this.templatesRepo.find({
      where: [
        { user: { id: userId }, appliesTo: docType },
        { user: { id: userId }, appliesTo: TemplateAppliesTo.BOTH },
        { user: IsNull(), appliesTo: docType },
        { user: IsNull(), appliesTo: TemplateAppliesTo.BOTH },
      ],
      relations: ['user'],
    });

    const rank = (tpl: FileTemplate): number => {
      const ownedByUser = tpl.user?.id === userId;
      const exactType = tpl.appliesTo === docType;
      if (ownedByUser && exactType) return 0;
      if (ownedByUser) return 1;
      if (exactType) return 2;
      return 3;
    };

    candidates.sort((a, b) => rank(a) - rank(b));
    return candidates[0];
  }

  // ---- File log (admin view, with basic filters) ----

  findFileRecords(filters: { userId?: number; type?: string; from?: string; to?: string }) {
    const qb = this.recordsRepo.createQueryBuilder('record').leftJoinAndSelect('record.user', 'user');

    if (filters.userId) qb.andWhere('user.id = :userId', { userId: filters.userId });
    if (filters.type) qb.andWhere('record.type = :type', { type: filters.type });
    if (filters.from) qb.andWhere('record.createdAt >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('record.createdAt <= :to', { to: filters.to });

    return qb.orderBy('record.createdAt', 'DESC').getMany();
  }

  async findRecordById(id: number): Promise<FileRecord> {
    const record = await this.recordsRepo.findOne({
      where: { id },
      relations: ['user', 'storageConnection'],
    });
    if (!record) throw new NotFoundException('File record not found');
    return record;
  }

  async removeRecord(id: number): Promise<void> {
    const record = await this.findRecordById(id);
    await this.recordsRepo.remove(record);
  }

  logFileRecord(data: Partial<FileRecord>): Promise<FileRecord> {
    return this.recordsRepo.save(this.recordsRepo.create(data));
  }
}
