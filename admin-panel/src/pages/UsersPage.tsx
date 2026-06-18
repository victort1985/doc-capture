import { useEffect, useState } from 'react';
import { Plus, X, Power, Trash2, UserRound } from 'lucide-react';
import { apiFetch } from '../services/api';

interface UserRow {
  id: number;
  username: string;
  role: 'admin' | 'user';
  language: string;
  isActive: boolean;
}

const EMPTY_FORM = { username: '', password: '', role: 'user', language: 'he' };

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      setUsers(await apiFetch<UserRow[]>('/users'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    }
  }

  useEffect(() => { load(); }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/users', { method: 'POST', body: JSON.stringify(form) });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
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
    load();
  }

  return (
    <div>
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Access control</span>
          <h1 className="page-title">Users</h1>
        </div>
        <button onClick={() => setShowForm((v) => !v)}>
          {showForm ? <><X size={16} /> Cancel</> : <><Plus size={16} /> New user</>}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={createUser}>
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
              <label>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
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
          </div>
          <div className="form-actions">
            <button type="submit"><Plus size={16} /> Create user</button>
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
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td className="mono">{u.role}</td>
                  <td className="mono">{u.language}</td>
                  <td>
                    <span className={`stamp-badge ${u.isActive ? 'on' : 'off'}`}>
                      {u.isActive ? 'active' : 'disabled'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
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
