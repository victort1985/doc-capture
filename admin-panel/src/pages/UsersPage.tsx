import { useEffect, useState } from 'react';
import { Plus, X, Power, Trash2, UserRound, Pencil } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Region {
  id: number;
  name: string;
}
interface City {
  id: number;
  name: string;
  region: Region;
}

interface UserRow {
  id: number;
  username: string;
  role: 'admin' | 'user';
  language: string;
  isActive: boolean;
  firstName?: string;
  lastName?: string;
  specialization?: string;
  phone?: string;
  city?: City;
  regions?: Region[];
  isGlobal: boolean;
  organization?: { id: number; name: string };
  allowedOrganizationIds?: number[];
  permissions?: Record<string, boolean>;
  group?: { id: number; name: string };
}
interface Group {
  id: number;
  name: string;
}
interface Org {
  id: number;
  name: string;
}

const EMPTY_FORM = {
  username: '', password: '', role: 'user', language: 'he',
  firstName: '', lastName: '', specialization: '', phone: '',
  cityId: '', regionIds: [] as number[], isGlobal: false, organizationId: '',
  allowedOrganizationIds: [] as number[],
  permissions: {} as Record<string, boolean>,
  groupId: '',
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const isSuperAdmin = me?.organizationId == null;
  const [users, setUsers] = useState<UserRow[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  async function load() {
    try {
      const [u, c, r, g] = await Promise.all([
        apiFetch<UserRow[]>('/users'),
        apiFetch<City[]>('/locations/cities'),
        apiFetch<Region[]>('/locations/regions'),
        apiFetch<Group[]>('/groups'),
      ]);
      setUsers(u);
      setCities(c);
      setRegions(r);
      setGroups(g);
      // Org dropdown is only meaningful for the super-admin — an
      // org-scoped admin's new users are auto-assigned their own
      // organization server-side regardless of what's sent, so org-admins
      // don't need this list at all (and would 403 fetching it anyway).
      if (isSuperAdmin) {
        setOrgs(await apiFetch<Org[]>('/organizations'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    }
  }

  useEffect(() => { load(); }, []);

  async function submitUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: Record<string, unknown> = {
      ...form,
      cityId: form.cityId ? Number(form.cityId) : undefined,
      organizationId: form.organizationId ? Number(form.organizationId) : undefined,
      groupId: form.groupId ? Number(form.groupId) : null,
    };
    // Editing: an empty password field means "leave it unchanged" — don't
    // force re-entering a password just to fix someone's specialization.
    if (editingId && !payload.password) delete payload.password;
    try {
      if (editingId) {
        await apiFetch(`/users/${editingId}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/users', { method: 'POST', body: JSON.stringify(payload) });
      }
      setForm(EMPTY_FORM);
      setShowForm(false);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save user');
    }
  }

  function openEditForm(u: UserRow) {
    setEditingId(u.id);
    setForm({
      username: u.username,
      password: '',
      role: u.role,
      language: u.language,
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      specialization: u.specialization || '',
      phone: u.phone || '',
      cityId: u.city ? String(u.city.id) : '',
      regionIds: u.regions?.map((r) => r.id) || [],
      isGlobal: u.isGlobal,
      organizationId: u.organization ? String(u.organization.id) : '',
      allowedOrganizationIds: u.allowedOrganizationIds ?? [],
      permissions: u.permissions ?? {},
      groupId: u.group ? String(u.group.id) : '',
    });
    setShowForm(true);
  }

  function cancelForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  }

  function toggleRegion(id: number) {
    setForm((f) => ({
      ...f,
      regionIds: f.regionIds.includes(id) ? f.regionIds.filter((r) => r !== id) : [...f.regionIds, id],
    }));
  }

  async function toggleActive(user: UserRow) {
    await apiFetch(`/users/${user.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    load();
  }

  async function removeUser(id: number) {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    await apiFetch(`/users/${id}`, { method: 'DELETE' });
    setUsers((prev: any[]) => prev.filter((x: any) => x.id !== id));
  }

  return (
    <div>
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Access control</span>
          <h1 className="page-title">Users</h1>
        </div>
        <button onClick={() => (showForm ? cancelForm() : setShowForm(true))}>
          {showForm ? <><X size={16} /> Cancel</> : <><Plus size={16} /> New user</>}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={submitUser}>
          <h3 style={{ marginTop: 0 }}>{editingId ? `Edit user — ${form.username}` : 'New user'}</h3>
          <div className="form-grid">
            <div>
              <label>Username</label>
              <input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            <div>
              <label>Password {editingId && <span style={{ fontWeight: 400, color: 'var(--ink-soft)' }}>(leave blank to keep current)</span>}</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editingId}
                minLength={6}
              />
            </div>
            <div>
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div>
              <label>Group</label>
              <select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
                <option value="">No group</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div>
              <label>Default language</label>
              <select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="he">he — Hebrew</option>
                <option value="en">en — English</option>
                <option value="ru">ru — Russian</option>
              </select>
            </div>
            {isSuperAdmin && (
              <div>
                <label>Organizations</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {/* No organization = super-admin */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, cursor: 'pointer',
                    padding: '8px 10px', borderRadius: 8,
                    background: !form.organizationId ? 'var(--primary-wash)' : 'transparent',
                    border: !form.organizationId ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                  }}>
                    <input
                      type="radio"
                      name="primary_org"
                      checked={!form.organizationId}
                      onChange={() => setForm(f => ({ ...f, organizationId: '', allowedOrganizationIds: [] }))}
                    />
                    <span>
                      <strong>Super-admin</strong>
                      <small style={{ display: 'block', color: 'var(--ink-soft)', fontWeight: 400 }}>No organization — sees everything</small>
                    </span>
                  </label>

                  {orgs.map((o) => {
                    const isPrimary = String(o.id) === form.organizationId;
                    const isAllowed = form.allowedOrganizationIds.includes(o.id);
                    const isSelected = isPrimary || isAllowed;
                    return (
                      <div key={o.id} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 8,
                        background: isSelected ? 'var(--primary-wash)' : 'transparent',
                        border: isPrimary ? '1.5px solid var(--primary)' : isAllowed ? '1.5px solid var(--border)' : '1.5px solid var(--border)',
                      }}>
                        {/* Checkbox — is user in this org? */}
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (isPrimary) {
                              // Uncheck primary → move to first allowed or clear
                              const next = form.allowedOrganizationIds[0];
                              setForm(f => ({
                                ...f,
                                organizationId: next ? String(next) : '',
                                allowedOrganizationIds: f.allowedOrganizationIds.slice(1),
                              }));
                            } else if (isAllowed) {
                              // Uncheck allowed → remove
                              setForm(f => ({
                                ...f,
                                allowedOrganizationIds: f.allowedOrganizationIds.filter(id => id !== o.id),
                              }));
                            } else {
                              // Check → add as allowed (or primary if none set)
                              if (!form.organizationId) {
                                setForm(f => ({ ...f, organizationId: String(o.id) }));
                              } else {
                                setForm(f => ({ ...f, allowedOrganizationIds: [...f.allowedOrganizationIds, o.id] }));
                              }
                            }
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: isPrimary ? 700 : 400 }}>{o.name}</span>
                          {isPrimary && (
                            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--primary)', fontWeight: 600,
                              background: 'var(--primary-wash)', padding: '2px 6px', borderRadius: 4 }}>
                              PRIMARY
                            </span>
                          )}
                        </div>
                        {/* Radio — set as primary org */}
                        {isSelected && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
                            color: isPrimary ? 'var(--primary)' : 'var(--ink-soft)', cursor: 'pointer' }}>
                            <input
                              type="radio"
                              name="primary_org"
                              checked={isPrimary}
                              onChange={() => {
                                setForm(f => ({
                                  ...f,
                                  organizationId: String(o.id),
                                  allowedOrganizationIds: [
                                    ...(f.organizationId ? [Number(f.organizationId)] : []),
                                    ...f.allowedOrganizationIds.filter(id => id !== o.id),
                                  ],
                                }));
                              }}
                            />
                            Set primary
                          </label>
                        )}
                      </div>
                    );
                  })}
                </div>
                <small style={{ color: 'var(--ink-soft)', marginTop: 6, display: 'block' }}>
                  ✓ Check organizations to assign. PRIMARY = home org (data scope). Others = can switch into.
                </small>
              </div>
            )}
            <div>
              <label>First name</label>
              <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label>Last name</label>
              <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div>
              <label>Specialization</label>
              <input value={form.specialization} onChange={(e) => setForm({ ...form, specialization: e.target.value })} />
            </div>
            <div>
              <label>Phone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label>City</label>
              <select value={form.cityId} onChange={(e) => setForm({ ...form, cityId: e.target.value })}>
                <option value="">—</option>
                {cities.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.region?.name})</option>
                ))}
              </select>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={form.isGlobal}
                  onChange={(e) => setForm({ ...form, isGlobal: e.target.checked })}
                  style={{ marginRight: 6 }}
                />
                Global (notified about every call, any region)
              </label>
            </div>
            <div>
              <label>
                <input
                  type="checkbox"
                  checked={form.permissions.warehouseTransfer ?? false}
                  onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, warehouseTransfer: e.target.checked } })}
                  style={{ marginRight: 6 }}
                />
                Can transfer warehouse equipment between locations
              </label>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Covers regions (call notification routing)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {regions.map((r) => (
                  <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      checked={form.regionIds.includes(r.id)}
                      onChange={() => toggleRegion(r.id)}
                    />
                    {r.name}
                  </label>
                ))}
                {regions.length === 0 && <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>No regions defined yet — see Locations.</span>}
              </div>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit">{editingId ? <><Plus size={16} /> Save changes</> : <><Plus size={16} /> Create user</>}</button>
          </div>
        </form>
      )}

      <div className="card" style={{ padding: users.length ? 8 : undefined }}>
        {users.length === 0 ? (
          <div className="empty-state">
            <UserRound size={32} strokeWidth={1.5} />
            <strong>No users yet</strong>
            <span>Create the first account to let staff sign in from the mobile app.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Language</th>
                {isSuperAdmin && <th>Organization</th>}
                <th>Regions</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.username}
                    {(u.firstName || u.lastName) && (
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
                        {[u.firstName, u.lastName].filter(Boolean).join(' ')}
                        {u.specialization ? ` · ${u.specialization}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="mono">{u.role}</td>
                  <td className="mono">{u.language}</td>
                  {isSuperAdmin && (
                    <td>{u.organization?.name ?? <span style={{ color: 'var(--ink-soft)' }}>super-admin</span>}</td>
                  )}
                  <td>
                    {u.isGlobal ? (
                      <span className="stamp-badge on">global</span>
                    ) : u.regions?.length ? (
                      u.regions.map((r) => r.name).join(', ')
                    ) : (
                      <span style={{ color: 'var(--ink-soft)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className={`stamp-badge ${u.isActive ? 'on' : 'off'}`}>
                      {u.isActive ? 'active' : 'disabled'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="ghost" onClick={() => openEditForm(u)} title="Edit">
                        <Pencil size={15} />
                      </button>
                      <button className="ghost" onClick={() => toggleActive(u)} title={u.isActive ? 'Disable' : 'Enable'}>
                        <Power size={15} />
                      </button>
                      <button className="ghost" onClick={() => removeUser(u.id)} title="Delete" style={{ color: 'var(--danger)' }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
