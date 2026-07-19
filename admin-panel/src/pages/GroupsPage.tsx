import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Group {
  id: number;
  name: string;
  permissions: Record<string, boolean>;
}

// Keep in sync with PermissionsPage.tsx and FEATURE_KEYS in
// server/src/modules/users/permissions.constants.ts — labels/groups
// come from i18n (perm.<key> / permGroup.<key>).
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

const GROUP_ORDER = Array.from(new Set(FEATURE_KEYS.map((f) => f.group)));

export default function GroupsPage() {
  const { t } = useTranslation();
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
    if (!confirm(t('groups.deleteConfirm'))) return;
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
          <span className="eyebrow">{t('groups.eyebrow')}</span>
          <h1 className="page-title">{t('nav.groups')}</h1>
        </div>
        <button onClick={() => setShowNew((v) => !v)}>
          {showNew ? <><X size={16} /> {t('common.cancel')}</> : <><Plus size={16} /> {t('groups.newGroup')}</>}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showNew && (
        <form className="card form-card" onSubmit={createGroup} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label>{t('groups.groupName')}</label>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('groups.groupNamePlaceholder')} required />
            </div>
            <button type="submit"><Plus size={15} /> {t('groups.create')}</button>
          </div>
        </form>
      )}

      <div className="split-layout">
        <div className="card split-sidebar">
          <div style={{ fontWeight: 600, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--ink-soft)', marginBottom: 8 }}>
            {t('nav.groups')}
          </div>
          {groups.length === 0 && <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t('groups.empty')}</div>}
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
              <button className="ghost" onClick={() => removeGroup(g.id)} title={t('groups.deleteGroup')}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>

        {sel && (
          <div className="split-content">
            <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label>{t('groups.groupName')}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <button onClick={save} disabled={saving}>
                <Save size={15} /> {saving ? t('common.saving') : saved ? `${t('common.saved')} ✓` : t('common.save')}
              </button>
            </div>

            <div className="card" style={{ marginBottom: 12, padding: '10px 16px', background: 'var(--surface-muted)', fontSize: 13 }}>
              {t('groups.explanation')}
            </div>

            {GROUP_ORDER.map((cat) => (
              <div key={cat} className="card" style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 13 }}>{t(`permGroup.${cat}`)}</div>
                {FEATURE_KEYS.filter((f) => f.group === cat).map((f) => (
                  <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!perms[f.key]}
                      onChange={() => setPerms((p) => ({ ...p, [f.key]: !p[f.key] }))}
                      style={{ width: 16, height: 16 }}
                    />
                    <span style={{ fontSize: 13 }}>{t(`perm.${f.key}`)}</span>
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
