import { useEffect, useState } from 'react';
import { Save, Route, Check } from 'lucide-react';
import { apiFetch } from '../services/api';

interface UserRow {
  id: number;
  username: string;
}

interface Connection {
  id: number;
  name: string;
  type: string;
}

interface ClientSettings {
  documentStorageConnection?: { id: number } | null;
  photoStorageConnection?: { id: number } | null;
  documentSubfolderPattern: string;
  photoSubfolderPattern: string;
}

const DEFAULT_FORM = {
  documentStorageConnectionId: '',
  photoStorageConnectionId: '',
  documentSubfolderPattern: '{date}/{place}',
  photoSubfolderPattern: '{date}/{place}',
};

export default function StorageRoutingPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<UserRow[]>('/users').then(setUsers).catch((e) => setError(e.message));
    apiFetch<Connection[]>('/storage/connections').then(setConnections).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (selectedUserId == null) return;
    setSaved(false);
    apiFetch<ClientSettings | null>(`/storage/client-settings/${selectedUserId}`)
      .then((settings) => {
        if (!settings) {
          setForm(DEFAULT_FORM);
          return;
        }
        setForm({
          documentStorageConnectionId: settings.documentStorageConnection?.id != null
            ? String(settings.documentStorageConnection.id) : '',
          photoStorageConnectionId: settings.photoStorageConnection?.id != null
            ? String(settings.photoStorageConnection.id) : '',
          documentSubfolderPattern: settings.documentSubfolderPattern || '{date}/{place}',
          photoSubfolderPattern: settings.photoSubfolderPattern || '{date}/{place}',
        });
      })
      .catch((e) => setError(e.message));
  }, [selectedUserId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (selectedUserId == null) return;
    setError(null);
    try {
      await apiFetch(`/storage/client-settings/${selectedUserId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          documentStorageConnectionId: form.documentStorageConnectionId
            ? parseInt(form.documentStorageConnectionId, 10) : undefined,
          photoStorageConnectionId: form.photoStorageConnectionId
            ? parseInt(form.photoStorageConnectionId, 10) : undefined,
          documentSubfolderPattern: form.documentSubfolderPattern,
          photoSubfolderPattern: form.photoSubfolderPattern,
        }),
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  return (
    <div>
      <div className="topbar">
        <span className="eyebrow">Routing</span>
        <h1 className="page-title">Storage routing</h1>
        <p style={{ color: 'var(--ink-soft)', marginTop: 8, marginBottom: 0 }}>
          Which storage connection each user's uploads go to — required before that
          user can upload anything from the mobile app.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <label>User</label>
        <select
          value={selectedUserId ?? ''}
          onChange={(e) => setSelectedUserId(e.target.value ? parseInt(e.target.value, 10) : null)}
        >
          <option value="">Select a user…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.username}</option>
          ))}
        </select>
      </div>

      {selectedUserId != null && (
        <form className="card form-card" onSubmit={save}>
          <div className="form-grid">
            <div>
              <label>Document storage connection</label>
              <select
                value={form.documentStorageConnectionId}
                onChange={(e) => setForm({ ...form, documentStorageConnectionId: e.target.value })}
              >
                <option value="">— none —</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                ))}
              </select>
            </div>
            <div>
              <label>Photo storage connection</label>
              <select
                value={form.photoStorageConnectionId}
                onChange={(e) => setForm({ ...form, photoStorageConnectionId: e.target.value })}
              >
                <option value="">— none —</option>
                {connections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                ))}
              </select>
            </div>
            <div>
              <label>Document subfolder pattern</label>
              <input
                className="mono"
                value={form.documentSubfolderPattern}
                onChange={(e) => setForm({ ...form, documentSubfolderPattern: e.target.value })}
              />
            </div>
            <div>
              <label>Photo subfolder pattern</label>
              <input
                className="mono"
                value={form.photoSubfolderPattern}
                onChange={(e) => setForm({ ...form, photoSubfolderPattern: e.target.value })}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit"><Save size={16} /> Save routing</button>
            {saved && <span className="stamp-badge on"><Check size={12} /> saved</span>}
          </div>
        </form>
      )}

      {connections.length === 0 && (
        <div className="card">
          <div className="empty-state">
            <Route size={32} strokeWidth={1.5} />
            <strong>No storage connections yet</strong>
            <span>Create one on the Storage connections page first.</span>
          </div>
        </div>
      )}
    </div>
  );
}
