import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { TOS_VERSION } from '../auth.service';
import { resolveEffectivePermissions } from '../../users/permissions.constants';

export interface JwtPayload {
  sub: number;
  username: string;
  role: string;
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'change_me',
    });
  }

  async validate(payload: JwtPayload) {
    // Re-checks the live user on every request (not just at login) so a
    // disabled or deleted account is locked out immediately instead of
    // staying valid on its existing token until natural expiry (up to
    // JWT_EXPIRES_IN, 7 days by default). Also picks up live `language`
    // for endpoints like /auth/me.
    let user;
    try {
      user = await this.usersService.findById(payload.sub);
    } catch {
      throw new UnauthorizedException('Account no longer exists');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account disabled');
    }
    // Strict !== (not a truthy/falsy check) — a token issued before
    // this field existed has payload.tokenVersion === undefined,
    // which correctly never matches a real numeric tokenVersion (0 or
    // higher) and gets rejected too. Deliberate: this makes deploying
    // this change itself a clean, one-time cutover that invalidates
    // every previously-issued token, not just ones explicitly revoked
    // afterward — every user logs in once more, then this mechanism
    // is live for real going forward.
    if (payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException('Session has been revoked — please log in again');
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      language: user.language,
      // null = super-admin (sees/manages everything); set = scoped to
      // that organization's data only. Always derived from the live DB
      // row above, never trusted from the JWT payload itself.
      organizationId: user.organization?.id ?? null,
      isDemoMode: user.organization?.isDemoMode ?? false,
      setupWizardCompleted: user.setupWizardCompleted,
      tosAccepted: user.tosAcceptedVersion === TOS_VERSION,
      totpEnabled: user.totpEnabled,
      allowedOrganizationIds: user.allowedOrganizationIds ?? [],
      permissions: resolveEffectivePermissions(user.role, user.group?.permissions, user.permissions),
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
    };
  }
}
