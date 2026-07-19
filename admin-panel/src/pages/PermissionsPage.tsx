import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { apiFetch } from '../services/api';

interface User {
  id: number;
  username: string;
  role: string;
  isGlobal: boolean;
  isActive: boolean;
  permissions: Record<string, boolean>;
}

// All available feature permissions — labels/groups come from i18n
// (perm.<key> / permGroup.<key>), keeping the keys/order in sync with
// server/src/modules/users/permissions.constants.ts.
const FEATURE_KEYS: { key: string; group: string }[] = [
  { key: 'calls.create', group: 'calls' },
  { key: 'calls.edit', group: 'calls' },
  { key: 'calls.delete', group: 'calls' },
  { key: 'calls.close', group: 'calls' },
  { key: 'calls.stats', group: 'calls' },
  { key: 'calendar.view', group: 'calendar' },
  { key: 'calendar.edit', group: 'calendar' },
  { key: 'calendar.all_orgs', group: 'calendar' },
  { key: 'fleet.view', group: 'fleet' },
  { key: 'fleet.refuel', group: 'fleet' },
  { key: 'fleet.manage', group: 'fleet' },
  { key: 'fleet.documents', group: 'fleet' },
  { key: 'warehouse.view', group: 'warehouse' },
  { key: 'warehouse.transactions', group: 'warehouse' },
  { key: 'warehouse.manage', group: 'warehouse' },
  { key: 'reports.work', group: 'reports' },
  { key: 'reports.fuel', group: 'reports' },
  { key: 'phonebook.edit', group: 'phonebook' },
  { key: 'orgs.switch', group: 'organizations' },
  { key: 'office.delivery_notes', group: 'office' },
  { key: 'office.quotes', group: 'office' },
  { key: 'office.invoices', group: 'office' },
];

const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  admin: Object.fromEntries(FEATURE_KEYS.map(f => [f.key, true])),
  user: {
    'calls.create': true, 'calls.close': true, 'calls.stats': false,
    'calendar.view': true, 'calendar.edit': true, 'calendar.all_orgs': false,
    'fleet.view': true, 'fleet.refuel': true, 'fleet.manage': false, 'fleet.documents': false,
    'warehouse.view': true, 'warehouse.transactions': true, 'warehouse.manage': false,
    'reports.work': false, 'reports.fuel': false,
    'phonebook.edit': false,
    'calls.edit': false, 'calls.delete': false,
    'orgs.switch': false,
    'office.delivery_notes': false, 'office.quotes': false, 'office.invoices': false,
  },
};

const GROUP_ORDER = Array.from(new Set(FEATURE_KEYS.map(f => f.group)));

export default function PermissionsPage() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<User[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean | null>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiFetch<User[]>('/users').then(us => { setUsers(us); if (us.length) select(us[0]); }).catch(() => {});
  }, []);

  function select(u: User) {
    setSelId(u.id);
    // null = use role default
    const resolved: Record<string, boolean | null> = {};
    for (const f of FEATURE_KEYS) {
      resolved[f.key] = u.permissions?.[f.key] ?? null;
    }
    setPerms(resolved);
    setSaved(false);
  }

  function effective(key: string): boolean {
    const sel = users.find(u => u.id === selId);
    if (!sel) return false;
    if (perms[key] !== null && perms[key] !== undefined) return perms[key] as boolean;
    return ROLE_DEFAULTS[sel.role]?.[key] ?? false;
  }

  function toggle(key: string) {
    const current = effective(key);
    const sel = users.find(u => u.id === selId);
    if (!sel) return;
    const roleDefault = ROLE_DEFAULTS[sel.role]?.[key] ?? false;
    // If toggling to role default → clear override (null)
    // Otherwise set explicit override
    const next = !current;
    setPerms(p => ({ ...p, [key]: next === roleDefault ? null : next }));
  }

  async function save() {
    if (!selId) return;
    setSaving(true);
    try {
      // Only save non-null (explicitly overridden) permissions
      const toSave: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(perms)) {
        if (v !== null) toSave[k] = v as boolean;
      }
      await apiFetch(`/users/${selId}`, { method: 'PATCH', body: JSON.stringify({ permissions: toSave }) });
      setSaved(true);
      const updated = await apiFetch<User[]>('/users');
      setUsers(updated);
    } finally { setSaving(false); }
  }

  const sel = users.find(u => u.id === selId);

  return (
    <div>
      <div className="topbar">
        <div><span className="eyebrow">{t('permissions.eyebrow')}</span><h1 className="page-title">{t('permissions.title')}</h1></div>
        <button onClick={save} disabled={saving}>
          <Save size={15} /> {saving ? t('common.saving') : saved ? `${t('common.saved')} ✓` : t('common.save')}
        </button>
      </div>

      <div className="split-layout">
        {/* User list */}
        <div className="card split-sidebar">
          <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)', marginBottom: 8 }}>{t('nav.users')}</div>
          {users.map(u => (
            <div key={u.id} onClick={() => select(u)}
              style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: selId === u.id ? 'var(--primary)' : 'transparent', color: selId === u.id ? '#fff' : 'inherit', marginBottom: 2 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{u.username}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{u.role}{u.isGlobal ? ` · ${t('permissions.global')}` : ''}</div>
            </div>
          ))}
        </div>

        {/* Permission grid */}
        {sel && (
          <div className="split-content">
            <div className="card" style={{ marginBottom: 8, padding: '10px 16px', background: 'var(--surface-muted)', fontSize: 13 }}>
              {t('permissions.editing')} <strong>{sel.username}</strong> ({sel.role}). {t('permissions.legend')}
            </div>
            {GROUP_ORDER.map(group => (
              <div key={group} className="card" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>{t(`permGroup.${group}`)}</div>
                {FEATURE_KEYS.filter(f => f.group === group).map(f => {
                  const val = effective(f.key);
                  const isOverride = perms[f.key] !== null;
                  return (
                    <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={val} onChange={() => toggle(f.key)}
                        style={{ width: 16, height: 16, accentColor: isOverride ? 'var(--primary)' : 'var(--ink-soft)' }} />
                      <span style={{ fontSize: 13, color: isOverride ? 'var(--ink)' : 'var(--ink-soft)' }}>{t(`perm.${f.key}`)}</span>
                      {isOverride && <span style={{ fontSize: 10, background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: 3 }}>{t('permissions.override')}</span>}
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
