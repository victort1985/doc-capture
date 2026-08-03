import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * For any route with an :orgId path parameter that reads/writes one
 * organization's settings — verifies the caller actually belongs to
 * that organization before letting the request through. A genuine
 * super-admin (organizationId === null) passes for any :orgId, since
 * they manage every organization; an org-scoped admin only passes
 * when :orgId matches their own organizationId.
 *
 * Added after finding that every *-settings controller using an
 * :orgId param (quote/credit-note/debit-note/delivery-note/invoice/
 * payment/return settings) had ZERO verification that the :orgId in
 * the URL matched the caller's own organization at all — any
 * organization's own admin account could read AND WRITE another
 * organization's settings (including the irreversible
 * lock-numbering action) just by putting a different, easily-
 * guessable small integer in the URL. Applying this guard is the fix
 * — one shared, reusable check instead of patching the same
 * comparison into a dozen individual endpoints across seven files,
 * where it would be easy to miss one.
 */
@Injectable()
export class OrgIdParamGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const orgIdParam = request.params?.orgId;
    if (orgIdParam === undefined) return true; // no :orgId on this route — nothing for this guard to check

    const orgId = parseInt(orgIdParam, 10);
    if (Number.isNaN(orgId)) return true; // not actually a numeric org id (e.g. a same-shaped static route like /all matched instead) — not this guard's concern

    if (user?.organizationId == null) return true; // genuine super-admin — manages every organization

    if (user.organizationId !== orgId) {
      throw new ForbiddenException("You don't have access to this organization's settings.");
    }
    return true;
  }
}
