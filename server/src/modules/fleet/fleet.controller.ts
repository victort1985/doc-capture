import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { FleetService } from './fleet.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

type RequestUser = { id: number; organizationId: number | null };

@Controller('fleet')
@UseGuards(JwtAuthGuard)
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Get('vehicles')
  findAll(@CurrentUser() user: RequestUser) {
    return this.fleetService.findAllVehicles(user.organizationId);
  }

  @Get('reminders')
  reminders(@CurrentUser() user: RequestUser) {
    return this.fleetService.reminders(user.organizationId);
  }

  @Post('vehicles')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: any, @CurrentUser() user: RequestUser) {
    return this.fleetService.createVehicle(dto, user.organizationId);
  }

  @Patch('vehicles/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: RequestUser) {
    return this.fleetService.updateVehicle(id, user.organizationId, dto);
  }

  @Delete('vehicles/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    return this.fleetService.removeVehicle(id, user.organizationId);
  }

  @Get('vehicles/:id/refuels')
  findRefuels(@Param('id', ParseIntPipe) id: number) {
    return this.fleetService.findRefuels(id);
  }

  @Post('vehicles/:id/refuels')
  createRefuel(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: RequestUser) {
    return this.fleetService.createRefuel(id, user.id, dto);
  }

  @Delete('refuels/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  removeRefuel(@Param('id', ParseIntPipe) id: number) {
    return this.fleetService.removeRefuel(id);
  }
}
