import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, ChevronDown, X } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Org {
  id: number;
  name: string;
}

/** Lets any admin who has access to more than one organization pick
 * which one to act as for the rest of the session — every org-scoped
 * page and every document created from then on (invoices, quotes,
 * etc., wherever the backend controller checks the active org rather
 * than the account's own fixed organizationId) behaves as if that
 * org's own admin were logged in. Persists across every tab/page for
 * the session (see AuthContext.switchOrg / api.ts's activeOrgId), and
 * is always cleared on a fresh login.
 *
 * Two different people can see this:
 * - A genuine super-admin (user.realOrganizationId == null): can act
 *   as any organization, or "no organization" (their own default
 *   super-admin view of everything).
 * - An ordinary admin who's been granted access to more than one
 *   organization (user.allowedOrganizationIds.length > 0): can switch
 *   among their own organization and the specific others they were
 *   granted — never every organization in the system, only their own
 *   allowed set (see GET /organizations/allowed, which already
 *   enforces this server-side).
 *
 * An admin with access to only their own single organization sees
 * nothing here at all — there's nothing to switch to. */
export default function OrgSwitcher() {
  const { t } = useTranslation();
  const { user, switchOrg } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const isSuperAdmin = (user?.realOrganizationId ?? user?.organizationId) == null;
  const hasMultiOrgAccess = isSuperAdmin || (user?.allowedOrganizationIds?.length ?? 0) > 0;

  useEffect(() => {
    if (!hasMultiOrgAccess) return;
    apiFetch<Org[]>('/organizations/allowed').then(setOrgs).catch(() => setOrgs([]));
  }, [hasMultiOrgAccess]);

  if (!hasMultiOrgAccess) return null;

  // For a super-admin, "acting as" a specific org is tracked via
  // isActingAsOrg (organizationId only means something once they've
  // picked one). For an ordinary multi-org admin, organizationId is
  // always their real, currently-active org — there's no separate
  // "acting as" state, they're just always scoped to whichever org
  // they last picked (defaulting to their own primary org).
  const activeOrg = isSuperAdmin
    ? (user?.isActingAsOrg ? orgs.find((o) => o.id === user.organizationId) : null)
    : orgs.find((o) => o.id === user?.organizationId);

  async function pick(orgId: number | null) {
    setSwitching(true);
    try {
      await switchOrg(orgId);
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  }

  const label = activeOrg ? activeOrg.name : t('orgSwitcher.superAdmin');

  return (
    <div style={{ position: 'relative', minWidth: 0 }}>
      <button
        type="button"
        className="ghost"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#fff', minWidth: 0 }}
        title={t('orgSwitcher.title')}
      >
        <Building2 size={14} style={{ flexShrink: 0 }} />
        <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: activeOrg ? 700 : 400 }}>
          {label}
        </span>
        <ChevronDown size={12} style={{ flexShrink: 0 }} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute', zIndex: 31, top: '100%', insetInlineEnd: 0, marginTop: 4,
              background: 'var(--surface, #fff)', border: '1px solid var(--border, #ddd)', borderRadius: 8,
              minWidth: 220, maxHeight: 320, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              color: 'var(--ink, #1a1a1a)',
            }}
          >
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-soft)', borderBottom: '1px solid var(--border-soft, #f0f0f0)' }}>
              {t('orgSwitcher.hint')}
            </div>
            {/* "No organization" (see everything) — only a genuine
                super-admin ever has this option; an ordinary multi-org
                admin always has to be scoped to exactly one of their
                allowed orgs, never "none". */}
            {isSuperAdmin && (
              <div
                onClick={() => pick(null)}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
                  fontWeight: activeOrg ? 400 : 700,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-muted, #f7f7f7)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {!activeOrg && <X size={13} />} {t('orgSwitcher.superAdmin')}
              </div>
            )}
            {orgs.map((o) => (
              <div
                key={o.id}
                onClick={() => pick(o.id)}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: activeOrg?.id === o.id ? 700 : 400 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-muted, #f7f7f7)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {o.name}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
