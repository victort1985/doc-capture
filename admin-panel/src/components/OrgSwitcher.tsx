import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, ChevronDown, X } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Org {
  id: number;
  name: string;
}

/** Lets a genuine super-admin pick one organization to "act as" for
 * the rest of the session — every org-scoped page (Tax Authority
 * settings, Tax Authority export, and any future one) then behaves
 * as if that org's own admin were logged in, without each page
 * needing its own picker. Persists across every tab/page for the
 * session (see AuthContext.switchOrg / api.ts's activeOrgId), and is
 * always cleared on a fresh login (never carries over between
 * sessions) — see AuthContext.login's own comment. Only rendered at
 * all for a genuine super-admin (user.realOrganizationId == null);
 * an org-scoped admin never sees this, they only ever have their own
 * one real org. */
export default function OrgSwitcher() {
  const { t } = useTranslation();
  const { user, switchOrg } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    apiFetch<Org[]>('/organizations').then(setOrgs).catch(() => setOrgs([]));
  }, []);

  const activeOrg = user?.isActingAsOrg ? orgs.find((o) => o.id === user.organizationId) : null;

  async function pick(orgId: number | null) {
    setSwitching(true);
    try {
      await switchOrg(orgId);
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="ghost"
        onClick={() => setOpen((v) => !v)}
        disabled={switching}
        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}
        title={t('orgSwitcher.title')}
      >
        <Building2 size={14} />
        {activeOrg ? activeOrg.name : t('orgSwitcher.superAdmin')}
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 30 }} onClick={() => setOpen(false)} />
          <div
            style={{
              position: 'absolute', zIndex: 31, top: '100%', insetInlineEnd: 0, marginTop: 4,
              background: 'var(--surface, #fff)', border: '1px solid var(--border, #ddd)', borderRadius: 8,
              minWidth: 220, maxHeight: 320, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            }}
          >
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--ink-soft)', borderBottom: '1px solid var(--border-soft, #f0f0f0)' }}>
              {t('orgSwitcher.hint')}
            </div>
            <div
              onClick={() => pick(null)}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
                fontWeight: activeOrg ? 400 : 600,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-muted, #f7f7f7)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {!activeOrg && <X size={13} />} {t('orgSwitcher.superAdmin')}
            </div>
            {orgs.map((o) => (
              <div
                key={o.id}
                onClick={() => pick(o.id)}
                style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, fontWeight: activeOrg?.id === o.id ? 600 : 400 }}
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
