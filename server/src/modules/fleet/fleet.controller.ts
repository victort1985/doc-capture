import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { FleetService } from './fleet.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

type RequestUser = { id: number; organizationId: number | null; role: string; isGlobal: boolean };

@Controller('fleet')
@UseGuards(JwtAuthGuard)
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  private privileged(u: RequestUser) {
    return u.organizationId == null || u.isGlobal || u.role === 'admin';
  }

  @Get('vehicles')
  findAll(@CurrentUser() user: RequestUser) {
    return this.fleetService.findAllVehicles(user.organizationId, this.privileged(user));
  }

  @Get('reminders')
  reminders(@CurrentUser() user: RequestUser) {
    return this.fleetService.reminders(user.organizationId, this.privileged(user));
  }

  @Post('vehicles')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: any, @CurrentUser() user: RequestUser) {
    return this.fleetService.createVehicle(dto, user.organizationId);
  }

  @Patch('vehicles/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.USER)
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any, @CurrentUser() user: RequestUser) {
    const priv = this.privileged(user);
    if (user.role === UserRole.USER && !user.isGlobal) {
      // Regular users can only update mileage
      dto = { currentMileage: dto.currentMileage };
    }
    return this.fleetService.updateVehicle(id, user.organizationId, dto, priv);
  }

  @Delete('vehicles/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    return this.fleetService.removeVehicle(id, user.organizationId, this.privileged(user));
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

  @Get('vehicles/:id/documents')
  findDocuments(@Param('id', ParseIntPipe) id: number) {
    return this.fleetService.findDocuments(id);
  }

  @Post('vehicles/:id/documents')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  addDocument(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: { originalname: string; buffer: Buffer; mimetype: string },
    @CurrentUser() user: RequestUser,
    @Body('description') description?: string,
  ) {
    return this.fleetService.addDocument(id, user.id, file, description);
  }

  @Get('documents/:id/download')
  async downloadDocument(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const file = await this.fleetService.downloadDocument(id);
    res.set({ 'Content-Type': file.mimetype, 'Content-Disposition': `inline; filename="${file.originalName.replace(/"/g, '')}"` });
    res.send(file.buffer);
  }

  @Delete('documents/:id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  removeDocument(@Param('id', ParseIntPipe) id: number) {
    return this.fleetService.removeDocument(id);
  }
}
