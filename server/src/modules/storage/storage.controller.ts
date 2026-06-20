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
import { UserRole } from '../users/entities/user.entity';

@Controller('storage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('connections')
  findAllConnections() {
    return this.storageService.findAllConnections();
  }

  @Post('connections')
  createConnection(@Body() dto: CreateStorageConnectionDto) {
    return this.storageService.createConnection(dto);
  }

  @Patch('connections/:id')
  updateConnection(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStorageConnectionDto,
  ) {
    return this.storageService.updateConnection(id, dto);
  }

  @Delete('connections/:id')
  removeConnection(@Param('id', ParseIntPipe) id: number) {
    return this.storageService.removeConnection(id);
  }

  @Post('connections/:id/test')
  testConnection(@Param('id', ParseIntPipe) id: number) {
    return this.storageService.testConnection(id);
  }

  @Get('client-settings/:userId')
  getClientSettings(@Param('userId', ParseIntPipe) userId: number) {
    return this.storageService.getClientSettings(userId);
  }

  @Patch('client-settings/:userId')
  updateClientSettings(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateClientStorageSettingsDto,
  ) {
    return this.storageService.updateClientSettings(userId, dto);
  }
}
