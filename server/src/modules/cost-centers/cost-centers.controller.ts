import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CostCentersService } from './cost-centers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

type ReqUser = { organizationId: number | null };

@Controller('cost-centers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CostCentersController {
  constructor(private readonly service: CostCentersService) {}

  @Get()
  findAll(@CurrentUser() user: ReqUser) {
    return this.service.findAll(user.organizationId);
  }

  @Get('report')
  getReport(@Query('from') from: string, @Query('to') to: string, @CurrentUser() user: ReqUser) {
    return this.service.getReport(user.organizationId, from, to);
  }

  @Post()
  create(@Body() body: { name: string }, @CurrentUser() user: ReqUser) {
    return this.service.create(user.organizationId, body.name);
  }

  @Patch(':id')
  rename(@Param('id', ParseIntPipe) id: number, @Body() body: { name: string }, @CurrentUser() user: ReqUser) {
    return this.service.rename(id, user.organizationId, body.name);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    await this.service.remove(id, user.organizationId);
    return { deleted: true };
  }
}
