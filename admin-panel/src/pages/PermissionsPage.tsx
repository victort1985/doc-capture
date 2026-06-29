import { useEffect, useState } from 'react';
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

// All available feature permissions with human-readable labels
const FEATURES: { key: string; label: string; group: string }[] = [
  { key: 'calls.create', label: 'Create calls', group: 'Calls' },
  { key: 'calls.edit', label: 'Edit calls', group: 'Calls' },
  { key: 'calls.delete', label: 'Delete calls', group: 'Calls' },
  { key: 'calls.close', label: 'Close calls', group: 'Calls' },
  { key: 'calls.stats', label: 'View statistics', group: 'Calls' },
  { key: 'calendar.view', label: 'View calendar', group: 'Calendar' },
  { key: 'calendar.edit', label: 'Edit calendar events', group: 'Calendar' },
  { key: 'calendar.all_orgs', label: 'View all organizations calendars', group: 'Calendar' },
  { key: 'fleet.view', label: 'View fleet', group: 'Fleet' },
  { key: 'fleet.refuel', label: 'Register refuels', group: 'Fleet' },
  { key: 'fleet.manage', label: 'Add/edit vehicles', group: 'Fleet' },
  { key: 'fleet.documents', label: 'Upload vehicle documents', group: 'Fleet' },
  { key: 'warehouse.view', label: 'View warehouse', group: 'Warehouse' },
  { key: 'warehouse.transactions', label: 'Register in/out transactions', group: 'Warehouse' },
  { key: 'warehouse.manage', label: 'Add/edit items and categories', group: 'Warehouse' },
  { key: 'warehouse.transfers', label: 'Transfer equipment between warehouses', group: 'Warehouse' },
  { key: 'reports.work', label: 'View work reports', group: 'Reports' },
  { key: 'reports.fuel', label: 'View fuel reports', group: 'Reports' },
  { key: 'phonebook.edit', label: 'Edit phone book', group: 'Phone book' },
];

const ROLE_DEFAULTS: Record<string, Record<string, boolean>> = {
  admin: Object.fromEntries(FEATURES.map(f => [f.key, true])),
  user: {
    'calls.create': true, 'calls.close': true, 'calls.stats': false,
    'calendar.view': true, 'calendar.edit': true, 'calendar.all_orgs': false,
    'fleet.view': true, 'fleet.refuel': true, 'fleet.manage': false, 'fleet.documents': false,
    'warehouse.view': true, 'warehouse.transactions': true, 'warehouse.manage': false, 'warehouse.transfers': false,
    'reports.work': false, 'reports.fuel': false,
    'phonebook.edit': false,
    'calls.edit': false, 'calls.delete': false,
  },
};

const groups = Array.from(new Set(FEATURES.map(f => f.group)));

export default function PermissionsPage() {
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
    for (const f of FEATURES) {
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
        <div><span className="eyebrow">Admin</span><h1 className="page-title">Permissions</h1></div>
        <button onClick={save} disabled={saving}>
          <Save size={15} /> {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      <div className="two-panel">
        {/* User list */}
        <div className="card two-panel-sidebar">
          <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)', marginBottom: 8 }}>Users</div>
          {users.map(u => (
            <div key={u.id} onClick={() => select(u)}
              style={{ padding: '8px 10px', borderRadius: 6, cursor: 'pointer', background: selId === u.id ? 'var(--primary)' : 'transparent', color: selId === u.id ? '#fff' : 'inherit', marginBottom: 2 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{u.username}</div>
              <div style={{ fontSize: 11, opacity: 0.7 }}>{u.role}{u.isGlobal ? ' · global' : ''}</div>
            </div>
          ))}
        </div>

        {/* Permission grid */}
        {sel && (
          <div style={{ flex: 1 }}>
            <div className="card" style={{ marginBottom: 8, padding: '10px 16px', background: 'var(--surface-muted)', fontSize: 13 }}>
              Editing <strong>{sel.username}</strong> ({sel.role}). Checkboxes in <span style={{ color: 'var(--ink-soft)' }}>grey</span> = role default. 
              Explicit overrides are saved per-user and override the role.
            </div>
            {groups.map(group => (
              <div key={group} className="card" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>{group}</div>
                {FEATURES.filter(f => f.group === group).map(f => {
                  const val = effective(f.key);
                  const isOverride = perms[f.key] !== null;
                  return (
                    <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', cursor: 'pointer' }}>
                      <input type="checkbox" checked={val} onChange={() => toggle(f.key)}
                        style={{ width: 16, height: 16, accentColor: isOverride ? 'var(--primary)' : 'var(--ink-soft)' }} />
                      <span style={{ fontSize: 13, color: isOverride ? 'var(--ink)' : 'var(--ink-soft)' }}>{f.label}</span>
                      {isOverride && <span style={{ fontSize: 10, background: 'var(--primary)', color: '#fff', padding: '1px 6px', borderRadius: 3 }}>override</span>}
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
