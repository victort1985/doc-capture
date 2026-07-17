import { useEffect, useState } from 'react';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Group {
  id: number;
  name: string;
  permissions: Record<string, boolean>;
}

// Keep in sync with FEATURES in PermissionsPage.tsx and FEATURE_KEYS in
// server/src/modules/users/permissions.constants.ts — the server is the
// source of truth for what actually gets enforced; this list is for
// display/editing only.
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
  { key: 'reports.work', label: 'View work reports', group: 'Reports' },
  { key: 'reports.fuel', label: 'View fuel reports', group: 'Reports' },
  { key: 'phonebook.edit', label: 'Edit phone book', group: 'Phone book' },
  { key: 'orgs.switch', label: 'Switch between organizations', group: 'Organizations' },
  { key: 'office.delivery_notes', label: 'Delivery notes', group: 'Office (mobile)' },
  { key: 'office.quotes', label: 'Quotes', group: 'Office (mobile)' },
  { key: 'office.invoices', label: 'Invoices', group: 'Office (mobile)' },
];

const categories = Array.from(new Set(FEATURES.map((f) => f.group)));

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [selId, setSelId] = useState<number | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    try {
      const gs = await apiFetch<Group[]>('/groups');
      setGroups(gs);
      if (gs.length && selId == null) select(gs[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load groups');
    }
  }

  useEffect(() => { load(); }, []);

  function select(g: Group) {
    setSelId(g.id);
    setName(g.name);
    setPerms(g.permissions ?? {});
    setSaved(false);
  }

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const g = await apiFetch<Group>('/groups', { method: 'POST', body: JSON.stringify({ name: newName.trim() }) });
      setNewName('');
      setShowNew(false);
      await load();
      select(g);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
    }
  }

  async function removeGroup(id: number) {
    if (!confirm('Delete this group? Users in it keep their accounts but lose the group\'s permissions (falling back to their role default).')) return;
    await apiFetch(`/groups/${id}`, { method: 'DELETE' });
    if (selId === id) setSelId(null);
    load();
  }

  async function save() {
    if (!selId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch(`/groups/${selId}`, { method: 'PATCH', body: JSON.stringify({ name, permissions: perms }) });
      setSaved(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save group');
    } finally {
      setSaving(false);
    }
  }

  const sel = groups.find((g) => g.id === selId);

  return (
    <div>
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Access control</span>
          <h1 className="page-title">Groups</h1>
        </div>
        <button onClick={() => setShowNew((v) => !v)}>
          {showNew ? <><X size={16} /> Cancel</> : <><Plus size={16} /> New group</>}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showNew && (
        <form className="card form-card" onSubmit={createGroup} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label>Group name</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Warehouse staff" required />
            </div>
            <button type="submit"><Plus size={15} /> Create</button>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div className="card" style={{ width: 220, flexShrink: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)', marginBottom: 8 }}>
            Groups
          </div>
          {groups.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>No groups yet.</div>}
          {groups.map((g) => (
            <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div
                onClick={() => select(g)}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 6, cursor: 'pointer',
                  background: selId === g.id ? 'var(--primary)' : 'transparent',
                  color: selId === g.id ? '#fff' : 'inherit', marginBottom: 2, fontWeight: 600, fontSize: 13,
                }}
              >
                {g.name}
              </div>
              <button className="ghost" onClick={() => removeGroup(g.id)} title="Delete group"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>

        {sel && (
          <div style={{ flex: 1 }}>
            <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label>Group name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <button onClick={save} disabled={saving}>
                <Save size={15} /> {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
              </button>
            </div>

            <div className="card" style={{ marginBottom: 12, padding: '10px 16px', background: 'var(--surface-muted)', fontSize: 13 }}>
              Members of this group get these permissions unless a specific user has their own override set
              on the Permissions page — a user override always wins over their group.
            </div>

            {categories.map((cat) => (
              <div key={cat} className="card" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>{cat}</div>
                {FEATURES.filter((f) => f.group === cat).map((f) => (
                  <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!perms[f.key]}
                      onChange={() => setPerms((p) => ({ ...p, [f.key]: !p[f.key] }))}
                      style={{ width: 16, height: 16 }}
                    />
                    <span style={{ fontSize: 13 }}>{f.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
