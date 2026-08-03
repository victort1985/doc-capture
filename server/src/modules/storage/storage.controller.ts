import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { StorageService } from './storage.service';
import { CreateStorageConnectionDto } from './dto/create-storage-connection.dto';
import { UpdateStorageConnectionDto } from './dto/update-storage-connection.dto';
import { UpdateClientStorageSettingsDto } from './dto/update-client-storage-settings.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('storage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('connections')
  @UseGuards(SuperAdminGuard)
  findAllConnections() {
    return this.storageService.findAllConnections();
  }

  @Post('connections')
  @UseGuards(SuperAdminGuard)
  createConnection(@Body() dto: CreateStorageConnectionDto) {
    return this.storageService.createConnection(dto);
  }

  @Patch('connections/:id')
  @UseGuards(SuperAdminGuard)
  updateConnection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStorageConnectionDto,
  ) {
    return this.storageService.updateConnection(id, dto);
  }

  @Delete('connections/:id')
  @UseGuards(SuperAdminGuard)
  removeConnection(@Param('id', ParseIntPipe) id: number) {
    return this.storageService.removeConnection(id);
  }

  @Post('connections/:id/test')
  @UseGuards(SuperAdminGuard)
  testConnection(@Param('id', ParseIntPipe) id: number) {
    return this.storageService.testConnection(id);
  }

  /** Per-user archival preferences (e.g. folder-naming pattern) — an
   * org-scoped admin may only view/edit these for a user in their OWN
   * organization, not any user id across every organization sharing
   * this tenant. */
  @Get('client-settings/:userId')
  getClientSettings(@Param('userId', ParseIntPipe) userId: number, @CurrentUser() user: { organizationId: number | null }) {
    return this.storageService.getClientSettings(userId, user.organizationId);
  }

  @Patch('client-settings/:userId')
  updateClientSettings(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateClientStorageSettingsDto,
    @CurrentUser() user: { organizationId: number | null },
  ) {
    return this.storageService.updateClientSettings(userId, dto, user.organizationId);
  }
}
