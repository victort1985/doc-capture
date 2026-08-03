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

    // "Active org" switching — lets an admin who can see more than one
    // organization pick which one to act as for a request, without
    // every controller needing its own "which org" branch. Two
    // different people can trigger this via the same X-Active-Org
    // header, with different allowed targets:
    //
    // 1. A genuine super-admin (realOrganizationId === null) can act
    //    as ANY organization that exists — this is the original,
    //    narrower mechanism this replaces.
    //
    // 2. An ordinary admin with allowedOrganizationIds set (granted
    //    access to more than one organization — see
    //    UsersService.resolveOrganization / the multi-org picker in
    //    the admin panel's user form) can switch among their own real
    //    organization plus specifically that granted set — never an
    //    arbitrary organization id, unlike a super-admin. This used to
    //    live only in active-org.util.ts's getActiveOrgId() helper,
    //    which just 2 controllers actually called — meaning switching
    //    only ever worked on those 2 pages for a regular multi-org
    //    admin, everywhere else silently stayed on their fixed home
    //    org. Folding the same validation in here instead means EVERY
    //    controller that reads user.organizationId (the vast
    //    majority of them) now respects the switch immediately.
    const activeOrgHeader = req.headers['x-active-org'];
    if (typeof activeOrgHeader === 'string' && activeOrgHeader.trim() !== '') {
      const requestedOrgId = parseInt(activeOrgHeader, 10);
      if (Number.isInteger(requestedOrgId)) {
        if (realOrganizationId == null) {
          // Super-admin: any organization that actually exists.
          try {
            await this.organizationsService.findById(requestedOrgId);
            effectiveOrganizationId = requestedOrgId;
            isActingAsOrg = true;
          } catch {
            // Invalid/deleted org id in the header — fall through and
            // stay as the real super-admin (organizationId: null)
            // rather than failing the whole request over a stale
            // client-side selection.
          }
        } else {
          // Ordinary admin: only their own org or a specifically
          // granted one, exactly as active-org.util.ts's
          // getActiveOrgId() already validated — never trust the
          // header beyond that allowed set.
          const allowed = [realOrganizationId, ...(user.allowedOrganizationIds ?? [])];
          if (allowed.includes(requestedOrgId)) {
            effectiveOrganizationId = requestedOrgId;
            isActingAsOrg = requestedOrgId !== realOrganizationId;
          }
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
