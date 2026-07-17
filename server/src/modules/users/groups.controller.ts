import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
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

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.groupsService.findAll({ organizationId: user.organizationId });
  }

  @Post()
  create(@Body() dto: { name: string; permissions?: Record<string, boolean> }, @CurrentUser() user: RequestUser) {
    return this.groupsService.create({ organizationId: user.organizationId }, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name?: string; permissions?: Record<string, boolean> },
    @CurrentUser() user: RequestUser,
  ) {
    return this.groupsService.update(id, { organizationId: user.organizationId }, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    await this.groupsService.remove(id, { organizationId: user.organizationId });
    return { deleted: true };
  }
}
