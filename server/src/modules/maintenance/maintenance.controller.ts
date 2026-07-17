import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceContractDto } from './dto/create-maintenance-contract.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

type ReqUser = { id: number; organizationId: number | null };

@Controller('maintenance-contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class MaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  findAll(@CurrentUser() user: ReqUser) {
    return this.maintenanceService.findAll(user.organizationId);
  }

  @Post()
  create(@Body() dto: CreateMaintenanceContractDto, @CurrentUser() user: ReqUser) {
    return this.maintenanceService.create(user.organizationId, user.id, dto);
  }

  @Patch(':id/active')
  setActive(@Param('id', ParseIntPipe) id: number, @Body() body: { active: boolean }, @CurrentUser() user: ReqUser) {
    return this.maintenanceService.setActive(id, user.organizationId, !!body.active);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: ReqUser) {
    await this.maintenanceService.remove(id, user.organizationId);
    return { deleted: true };
  }
}
