import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { UsersService } from '../../users/users.service';
import { OrganizationsService } from '../../organizations/organizations.service';
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
  constructor(
    private readonly usersService: UsersService,
    private readonly organizationsService: OrganizationsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'change_me',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
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

    const realOrganizationId = user.organization?.id ?? null;
    let effectiveOrganizationId = realOrganizationId;
    let isActingAsOrg = false;

    // Super-admin "act as organization" — lets a super-admin manage
    // one org's data (settings, exports, anything org-scoped) without
    // every single org-scoped controller needing its own "or pick an
    // org" branch. Deliberately restricted to GENUINE super-admins
    // only (realOrganizationId === null) — an org-scoped admin's own
    // X-Active-Org header (if a browser extension or old tab somehow
    // sent one) is silently ignored rather than honored, since that
    // admin already has their own real org and has no business
    // becoming a different one via a header alone. Also deliberately
    // separate from the mobile app's own X-Active-Org mechanism (see
    // active-org.util.ts) — that one is for an org-scoped user
    // switching between THEIR OWN allowedOrganizationIds, a different
    // feature with different trust boundaries than a super-admin
    // impersonating an arbitrary org.
    const activeOrgHeader = req.headers['x-active-org'];
    if (realOrganizationId == null && typeof activeOrgHeader === 'string' && activeOrgHeader.trim() !== '') {
      const requestedOrgId = parseInt(activeOrgHeader, 10);
      if (Number.isInteger(requestedOrgId)) {
        try {
          await this.organizationsService.findById(requestedOrgId); // throws if it doesn't exist
          effectiveOrganizationId = requestedOrgId;
          isActingAsOrg = true;
        } catch {
          // Invalid/deleted org id in the header — fall through and
          // stay as the real super-admin (organizationId: null)
          // rather than failing the whole request over a stale
          // client-side selection.
        }
      }
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      language: user.language,
      // null = super-admin (sees/manages everything); set = scoped to
      // that organization's data only. Always derived from the live DB
      // row above (or the validated X-Active-Org header for a genuine
      // super-admin), never trusted from the JWT payload itself.
      organizationId: effectiveOrganizationId,
      // The account's own real org (always null for a genuine super-
      // admin, regardless of which org they're currently acting as) —
      // for anything that needs to know the difference between "who
      // is actually logged in" and "which org's data this request is
      // scoped to", e.g. an audit log entry or a UI banner.
      realOrganizationId,
      isActingAsOrg,
      // Was missing entirely before — every isGlobal check elsewhere
      // in the app (reports.controller.ts, fleet.controller.ts,
      // calendar.controller.ts) always saw undefined here regardless
      // of what's actually stored on the account, silently defeating
      // the whole point of the flag for anyone legitimately granted
      // cross-org visibility.
      isGlobal: user.isGlobal ?? false,
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
