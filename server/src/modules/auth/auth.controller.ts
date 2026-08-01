import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { AuthService, TOS_VERSION } from './auth.service';
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
    const isAdminPanel = clientType === 'admin-panel';
    return this.authService.login(dto.username, dto.password, isMobile ? dto.deviceId : undefined, dto.platform, dto.totpCode, isAdminPanel);
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

  @Post('complete-setup-wizard')
  @UseGuards(JwtAuthGuard)
  async completeSetupWizard(@CurrentUser() user: { id: number }) {
    await this.usersService.markSetupWizardCompleted(user.id);
    return { ok: true };
  }

  @Post('accept-tos')
  @UseGuards(JwtAuthGuard)
  async acceptTos(@CurrentUser() user: { id: number }) {
    await this.usersService.acceptTos(user.id, TOS_VERSION);
    return { ok: true };
  }

  /** Step 1 of 2FA setup: generates a fresh secret (NOT yet enabled —
   * see User.totpEnabled's doc comment for why) and returns a
   * scannable QR code as a data URL. Calling this again before
   * confirming just replaces the pending secret, so re-scanning after
   * a failed confirm is safe. */
  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  async setup2FA(@CurrentUser() user: { id: number; username: string }) {
    const secret = authenticator.generateSecret();
    await this.usersService.setTotpSecret(user.id, secret);
    const otpauth = authenticator.keyuri(user.username, 'Vixor ERP', secret);
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    return { secret, qrDataUrl };
  }

  /** Step 2: proves the person can actually generate a valid code
   * with the secret from setup2FA before the login-time challenge
   * turns on — see User.totpEnabled. */
  @Post('2fa/confirm')
  @UseGuards(JwtAuthGuard)
  async confirm2FA(@CurrentUser() user: { id: number }, @Body() body: { code: string }) {
    const secret = await this.usersService.getTotpSecret(user.id);
    if (!secret || !authenticator.check(body.code, secret)) {
      throw new BadRequestException('Invalid code — check your authenticator app and try again.');
    }
    await this.usersService.setTotpEnabled(user.id, true);
    return { ok: true };
  }

  /** Requires the account password to disable — 2FA protects against
   * exactly the scenario of someone else having gotten hold of the
   * password, so turning it off must not be possible with just an
   * already-active session (e.g. a stolen/left-open browser tab). */
  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  async disable2FA(@CurrentUser() user: { id: number }, @Body() body: { password: string }) {
    const ok = await this.usersService.verifyPassword(user.id, body.password);
    if (!ok) throw new ForbiddenException('Incorrect password');
    await this.usersService.setTotpEnabled(user.id, false);
    await this.usersService.setTotpSecret(user.id, null);
    return { ok: true };
  }
}
