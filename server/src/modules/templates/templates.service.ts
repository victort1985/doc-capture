import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThanOrEqual, Repository } from 'typeorm';
import { FileTemplate, TemplateAppliesTo } from './entities/file-template.entity';
import { FileRecord, FileRecordType } from './entities/file-record.entity';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { User } from '../users/entities/user.entity';

type Requester = { organizationId: number | null };

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(FileTemplate)
    private readonly templatesRepo: Repository<FileTemplate>,
    @InjectRepository(FileRecord)
    private readonly recordsRepo: Repository<FileRecord>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  /** A regular org admin sees their own organization's per-user
   * templates plus the truly-global ones (no owner at all — shared
   * platform-wide by design, see findApplicableTemplate's own doc
   * comment). A super-admin (organizationId == null) sees everything,
   * matching every other admin listing in this app. Previously
   * returned every template from every organization unconditionally
   * — a regular admin from one org could list, edit, and delete a
   * completely different org's personal file-naming templates. */
  findAll(requester: Requester): Promise<FileTemplate[]> {
    if (requester.organizationId == null) {
      return this.templatesRepo.find({ relations: ['user', 'user.organization'] });
    }
    return this.templatesRepo
      .createQueryBuilder('tpl')
      .leftJoinAndSelect('tpl.user', 'user')
      .leftJoin('user.organization', 'organization')
      .where('tpl.userId IS NULL')
      .orWhere('organization.id = :orgId', { orgId: requester.organizationId })
      .getMany();
  }

  /** Same fetch-then-compare cross-org isolation pattern used
   * throughout this app — a global template (no owner) is editable
   * by a super-admin only, since it's shared platform-wide and a
   * regular org admin changing it would silently affect every other
   * organization too. */
  private async findOneScoped(id: number, requester: Requester): Promise<FileTemplate> {
    const tpl = await this.templatesRepo.findOne({ where: { id }, relations: ['user', 'user.organization'] });
    if (!tpl) throw new NotFoundException('Template not found');
    if (requester.organizationId == null) return tpl; // super-admin
    if (!tpl.user) throw new ForbiddenException('Only a super-admin can modify a global template.');
    if (tpl.user.organization?.id !== requester.organizationId) throw new NotFoundException('Template not found');
    return tpl;
  }

  async findOne(id: number, requester: Requester): Promise<FileTemplate> {
    return this.findOneScoped(id, requester);
  }

  async create(requester: Requester, dto: CreateTemplateDto): Promise<FileTemplate> {
    if (dto.userId) {
      // Verify the target user actually belongs to the caller's own
      // organization — otherwise a regular admin could attribute a
      // template to (and have it apply for) a user in a different
      // organization entirely.
      const targetUser = await this.usersRepo.findOne({ where: { id: dto.userId }, relations: ['organization'] });
      if (!targetUser) throw new NotFoundException('User not found');
      if (requester.organizationId != null && targetUser.organization?.id !== requester.organizationId) {
        throw new ForbiddenException('That user is not in your organization.');
      }
    } else if (requester.organizationId != null) {
      // A regular admin creating a template with no owner at all
      // would silently create a GLOBAL, platform-wide template —
      // only a super-admin should be able to do that.
      throw new ForbiddenException('Only a super-admin can create a global template — pick a specific user instead.');
    }
    return this.templatesRepo.save(
      this.templatesRepo.create({
        name: dto.name,
        pattern: dto.pattern,
        appliesTo: dto.appliesTo,
        user: dto.userId ? ({ id: dto.userId } as any) : undefined,
      }),
    );
  }

  async update(id: number, requester: Requester, dto: UpdateTemplateDto): Promise<FileTemplate> {
    const tpl = await this.findOneScoped(id, requester);
    Object.assign(tpl, {
      name: dto.name ?? tpl.name,
      pattern: dto.pattern ?? tpl.pattern,
      appliesTo: dto.appliesTo ?? tpl.appliesTo,
    });
    return this.templatesRepo.save(tpl);
  }

  async remove(id: number, requester: Requester): Promise<void> {
    const tpl = await this.findOneScoped(id, requester);
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

  /** Single global pattern (no per-user variant) for phone book contact filenames. */
  async findPhoneBookTemplate(): Promise<FileTemplate | undefined> {
    const tpl = await this.templatesRepo.findOne({ where: { appliesTo: TemplateAppliesTo.PHONEBOOK } });
    return tpl ?? undefined;
  }

  // ---- File log (admin view, with basic filters) ----

  findFileRecords(filters: { userId?: number; organizationId?: number | null; type?: string; from?: string; to?: string }) {
    const qb = this.recordsRepo.createQueryBuilder('record')
      .leftJoinAndSelect('record.user', 'user')
      .leftJoin('user.organization', 'organization');

    if (filters.userId) qb.andWhere('user.id = :userId', { userId: filters.userId });
    if (filters.organizationId != null) qb.andWhere('organization.id = :organizationId', { organizationId: filters.organizationId });
    if (filters.type) qb.andWhere('record.type = :type', { type: filters.type });
    if (filters.from) qb.andWhere('record.createdAt >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('record.createdAt <= :to', { to: filters.to });

    return qb.orderBy('record.createdAt', 'DESC').getMany();
  }

  async findRecordById(id: number): Promise<FileRecord> {
    const record = await this.recordsRepo.findOne({
      where: { id },
      relations: ['user', 'user.organization', 'storageConnection'],
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

  /** How many records already exist today for this place+type — used to
   * seed the `{counter}` naming variable so it keeps incrementing across
   * separate uploads instead of restarting at 1 every time (which was
   * silently overwriting earlier files that resolved to the same name). */
  async countTodayRecords(place: string, type: FileRecordType): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.recordsRepo.count({
      where: {
        place,
        type,
        createdAt: MoreThanOrEqual(startOfDay),
      },
    });
  }
}
