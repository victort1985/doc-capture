import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { UsersService } from '../users/users.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() dto: LoginDto, @Headers('x-client-type') clientType?: string) {
    const isMobile = clientType === 'mobile';
    return this.authService.login(dto.username, dto.password, isMobile ? dto.deviceId : undefined, dto.platform);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: { id: number; username: string; role: string; language: string }) {
    return user;
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @CurrentUser() user: { id: number },
    @Body() dto: { currentPassword: string; newPassword: string },
  ) {
    await this.usersService.changeOwnPassword(user.id, dto.currentPassword, dto.newPassword);
    return { ok: true };
  }
}
