import { ForbiddenException } from '@nestjs/common';

/**
 * Demo/sandbox organizations only let a super-admin touch the
 * baseline settings that survive the nightly cleanup (calendar sync,
 * order-intake email, document-sending email) — a regular org-scoped
 * admin of a demo org can use the product but not reconfigure the
 * account behind it. See Organization.isDemoMode.
 *
 * `requesterOrgId` is the CALLING user's own organizationId (null for
 * a super-admin) — not the org being modified.
 */
export function assertCanEditDemoSettings(isDemoMode: boolean | undefined, requesterOrgId: number | null): void {
  if (isDemoMode && requesterOrgId != null) {
    throw new ForbiddenException('This is a demo organization — only a super-admin can change these settings.');
  }
}
