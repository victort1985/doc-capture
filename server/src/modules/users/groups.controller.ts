import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from './entities/user.entity';

type RequestUser = { id: number; organizationId: number | null };

@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  private effectiveOrgId(user: RequestUser, orgId?: string): number | null {
    // Only a super-admin (organizationId === null) can target a
    // different org via ?orgId= — a regular admin always stays
    // scoped to their own, regardless of the query string.
    return user.organizationId == null && orgId ? Number(orgId) : user.organizationId;
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser, @Query('orgId') orgId?: string) {
    return this.groupsService.findAll({ organizationId: this.effectiveOrgId(user, orgId) });
  }

  @Post()
  create(@Body() dto: { name: string; permissions?: Record<string, boolean> }, @CurrentUser() user: RequestUser, @Query('orgId') orgId?: string) {
    return this.groupsService.create({ organizationId: this.effectiveOrgId(user, orgId) }, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name?: string; permissions?: Record<string, boolean> },
    @CurrentUser() user: RequestUser,
    @Query('orgId') orgId?: string,
  ) {
    return this.groupsService.update(id, { organizationId: this.effectiveOrgId(user, orgId) }, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser, @Query('orgId') orgId?: string) {
    await this.groupsService.remove(id, { organizationId: this.effectiveOrgId(user, orgId) });
    return { deleted: true };
  }
}
