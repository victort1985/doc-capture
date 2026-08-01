import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { UsersService } from '../users/users.service';
import { resolveEffectivePermissions } from '../users/permissions.constants';
import { DevicesService } from '../license/devices.service';

/** Bump this whenever the Terms of Service text materially changes —
 * every user (regardless of tosAcceptedAt) will be asked to accept
 * again, since accepting version "1" isn't the same agreement as
 * whatever version replaced it. */
export const TOS_VERSION = '1';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly devicesService: DevicesService,
  ) {}

  async validateUser(username: string, password: string) {
    const user = await this.usersService.findByUsername(username);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }

  async login(username: string, password: string, deviceId?: string, platform?: string, totpCode?: string, isAdminPanel?: boolean) {
    const user = await this.validateUser(username, password);

    // 2FA (requirement #16) — a correct password alone isn't enough
    // once enabled. No token of any kind (not even a short-lived one)
    // is issued until a valid code is presented, so there's no
    // intermediate state to attack; the client just resubmits
    // username+password+code together once it has one.
    if (user.totpEnabled) {
      if (!totpCode) {
        throw new UnauthorizedException({ code: 'TOTP_REQUIRED', message: 'Two-factor code required' });
      }
      const valid = user.totpSecret && authenticator.check(totpCode, user.totpSecret);
      if (!valid) {
        throw new UnauthorizedException({ code: 'TOTP_INVALID', message: 'Invalid two-factor code' });
      }
    }

    // Fully resolved (role default -> group -> user override) — used
    // both for the admin-panel gate right below and in the response
    // payload, so there's exactly one place this ever gets computed.
    const permissions = resolveEffectivePermissions(user.role, user.group?.permissions, user.permissions);

    // Unlike every other permission key (which only ever hides/shows
    // something inside an already-logged-in session), this one blocks
    // the login itself — a person with zero business reason to open
    // the web admin panel (a field technician, a driver) shouldn't be
    // ABLE to, not just fail to see anything useful once they're in.
    // Same "reject before any token is issued" principle as the 2FA
    // and device-approval checks above.
    if (isAdminPanel && !permissions['system.adminPanelAccess']) {
      throw new ForbiddenException('This account is not permitted to access the admin panel.');
    }

    // Mobile logins only (deviceId is only ever passed for
    // X-Client-Type: mobile — see AuthController) — a rejected device
    // throws before any token is issued, same as a wrong password.
    if (deviceId) {
      await this.devicesService.registerOrTouch(deviceId, user.id, platform);
    }

    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        language: user.language,
        role: user.role,
        organizationId: user.organization?.id ?? null,
        isDemoMode: user.organization?.isDemoMode ?? false,
        setupWizardCompleted: user.setupWizardCompleted,
        tosAccepted: user.tosAcceptedVersion === TOS_VERSION,
        totpEnabled: user.totpEnabled,
        allowedOrganizationIds: user.allowedOrganizationIds ?? [],
        permissions,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
      },
    };
  }
}
