import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntry } from './entities/audit-log-entry.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

type ReqUser = { organizationId: number | null };

@Controller('audit-log')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AuditLogController {
  constructor(@InjectRepository(AuditLogEntry) private readonly repo: Repository<AuditLogEntry>) {}

  @Get()
  async findAll(
    @CurrentUser() user: ReqUser,
    @Query('resourceType') resourceType?: string,
    @Query('resourceId') resourceId?: string,
    @Query('limit') limit?: string,
  ) {
    const qb = this.repo.createQueryBuilder('e').orderBy('e.createdAt', 'DESC').take(Math.min(Number(limit) || 200, 500));
    if (user.organizationId != null) qb.andWhere('e."organizationId" = :orgId', { orgId: user.organizationId });
    if (resourceType) qb.andWhere('e.resourceType = :resourceType', { resourceType });
    if (resourceId) qb.andWhere('e.resourceId = :resourceId', { resourceId });
    return qb.getMany();
  }
}
