import { Controller, Delete, Get, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('devices')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  findAll() {
    return this.devicesService.findAll();
  }

  @Post(':id/revoke')
  async revoke(@Param('id', ParseIntPipe) id: number) {
    await this.devicesService.revoke(id);
    return { revoked: true };
  }

  @Post(':id/unrevoke')
  async unrevoke(@Param('id', ParseIntPipe) id: number) {
    await this.devicesService.unrevoke(id);
    return { revoked: false };
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.devicesService.remove(id);
    return { deleted: true };
  }
}
