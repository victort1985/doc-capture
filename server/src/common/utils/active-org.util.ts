/**
 * Returns the effective organization ID for the current request.
 *
 * Priority:
 *  1. X-Active-Org header (mobile org-switcher) — validated against user's allowed orgs
 *  2. user.organizationId from JWT (home org)
 *  3. null (super-admin, no restriction)
 */
export function getActiveOrgId(
  user: { organizationId: number | null; allowedOrganizationIds?: number[]; role?: string },
  request: { headers?: Record<string, string | string[] | undefined> },
): number | null {
  // Super-admin sees everything regardless of header
  if (user.organizationId == null) return null;

  const header = request.headers?.['x-active-org'];
  if (!header) return user.organizationId;

  const requestedId = parseInt(String(Array.isArray(header) ? header[0] : header), 10);
  if (isNaN(requestedId)) return user.organizationId;

  // User can only switch to their own org or orgs explicitly allowed
  const allowed = [
    user.organizationId,
    ...(user.allowedOrganizationIds ?? []),
  ];

  return allowed.includes(requestedId) ? requestedId : user.organizationId;
}
