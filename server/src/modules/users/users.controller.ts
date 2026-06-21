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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UserRole } from './entities/user.entity';

type RequestUser = { id: number; organizationId: number | null };

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.usersService.findAll({ organizationId: user.organizationId });
  }

  @Post()
  create(@Body() dto: CreateUserDto, @CurrentUser() user: RequestUser) {
    return this.usersService.create({ organizationId: user.organizationId }, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto, @CurrentUser() user: RequestUser) {
    return this.usersService.update(id, { organizationId: user.organizationId }, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: RequestUser) {
    return this.usersService.remove(id, { organizationId: user.organizationId });
  }

  // Push-token registration is for the logged-in user's own device, not
  // an admin-management action — overrides the class-level
  // @Roles(ADMIN) so any authenticated user (technician or admin) can
  // call these for themselves.
  @Post('me/push-token')
  @Roles(UserRole.ADMIN, UserRole.USER)
  setPushToken(@Body() dto: { token: string; platform: string }, @CurrentUser() user: RequestUser) {
    return this.usersService.setPushToken(user.id, dto.token, dto.platform);
  }

  @Delete('me/push-token')
  @Roles(UserRole.ADMIN, UserRole.USER)
  clearPushToken(@CurrentUser() user: RequestUser) {
    return this.usersService.clearPushToken(user.id);
  }
}
