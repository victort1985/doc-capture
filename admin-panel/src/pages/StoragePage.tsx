import { useEffect, useState } from 'react';
import { Plus, X, Trash2, Pencil, HardDrive, Save, Wifi, Loader2, Check, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Connection {
  id: number;
  name: string;
  type: 'local' | 'ftp' | 'sftp' | 'synology';
  host?: string;
  port?: number;
  basePath: string;
  extraConfig?: { secure?: boolean } | null;
}

const EMPTY_FORM = { name: '', type: 'local', host: '', port: '', username: '', password: '', basePath: '', secure: false };

export default function StoragePage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testResults, setTestResults] = useState<Record<number, { ok: boolean; message: string } | 'pending'>>({});

  async function load() {
    try {
      setConnections(await apiFetch<Connection[]>('/storage/connections'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connections');
    }
  }

  useEffect(() => { load(); }, []);

  function openCreateForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEditForm(c: Connection) {
    setEditingId(c.id);
    setForm({
      name: c.name,
      type: c.type,
      host: c.host || '',
      port: c.port ? String(c.port) : '',
      username: '', // credentials are never sent back from the API — leave blank to keep
      password: '',
      basePath: c.basePath,
      secure: Boolean(c.extraConfig?.secure),
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const body: Record<string, unknown> = {
      name: form.name,
      type: form.type,
      basePath: form.basePath,
    };
    if (form.type !== 'local') {
      body.host = form.host;
      body.port = form.port ? parseInt(form.port, 10) : undefined;
      if (form.username) body.username = form.username;
      if (form.password) body.password = form.password; // omit entirely if blank — keeps existing on edit
    }
    if (form.type === 'synology' || form.type === 'ftp') {
      body.extraConfig = { secure: form.secure };
    }

    try {
      if (editingId != null) {
        await apiFetch(`/storage/connections/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/storage/connections', { method: 'POST', body: JSON.stringify(body) });
      }
      closeForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save connection');
    }
  }

  async function removeConnection(id: number) {
    if (!confirm('Delete this storage connection?')) return;
    await apiFetch(`/storage/connections/${id}`, { method: 'DELETE' });
    setConnections((prev: any[]) => prev.filter((x: any) => x.id !== id));
  }

  async function testConnection(id: number) {
    setTestResults((prev) => ({ ...prev, [id]: 'pending' }));
    try {
      const result = await apiFetch<{ ok: boolean; message: string }>(`/storage/connections/${id}/test`, {
        method: 'POST',
      });
      setTestResults((prev) => ({ ...prev, [id]: result }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: { ok: false, message: err instanceof Error ? err.message : 'Test failed' },
      }));
    }
  }

  const needsNetwork = form.type !== 'local';

  return (
    <div>
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">Destinations</span>
          <h1 className="page-title">Storage connections</h1>
        </div>
        <button onClick={() => (showForm ? closeForm() : openCreateForm())}>
          {showForm ? <><X size={16} /> Cancel</> : <><Plus size={16} /> New connection</>}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={submitForm}>
          <div className="form-grid">
            <div>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label>Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                disabled={editingId != null}
              >
                <option value="local">Local filesystem</option>
                <option value="ftp">FTP</option>
                <option value="sftp">SFTP</option>
                <option value="synology">Synology NAS (WebDAV)</option>
              </select>
            </div>
            {needsNetwork && (
              <>
                <div>
                  <label>Host</label>
                  <input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
                </div>
                <div>
                  <label>Port</label>
                  <input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
                </div>
                <div>
                  <label>Username</label>
                  <input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder={editingId != null ? 'Leave blank to keep current' : ''}
                  />
                </div>
                <div>
                  <label>Password</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder={editingId != null ? 'Leave blank to keep current' : ''}
                  />
                </div>
              </>
            )}
            {(form.type === 'synology' || form.type === 'ftp') && (
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={form.secure}
                    onChange={(e) => setForm({ ...form, secure: e.target.checked })}
                    style={{ width: 'auto' }}
                  />
                  {form.type === 'synology'
                    ? 'HTTPS (DSM WebDAV default ports: 5005 HTTP / 5006 HTTPS)'
                    : 'FTPS (encrypted FTP — needs an FTPS-capable server)'}
                </label>
              </div>
            )}
            <div>
              <label>Base path</label>
              <input
                className="mono"
                value={form.basePath}
                onChange={(e) => setForm({ ...form, basePath: e.target.value })}
                placeholder="/volume1/scans"
                required
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit">
              {editingId != null ? <><Save size={16} /> Save changes</> : <><Plus size={16} /> Create connection</>}
            </button>
          </div>
        </form>
      )}

      <div className="card" style={{ padding: connections.length ? 8 : undefined }}>
        {connections.length === 0 ? (
          <div className="empty-state">
            <HardDrive size={32} strokeWidth={1.5} />
            <strong>No storage connections yet</strong>
            <span>Add a local folder, FTP server, or Synology NAS to send captured files to.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Host</th>
                <th className="mono">Base path</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {connections.map((c) => {
                const result = testResults[c.id];
                return (
                  <tr key={c.id}>
                    <td>
                      {c.name}
                      {result && result !== 'pending' && (
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 12,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            color: result.ok ? 'var(--success, #2e7d32)' : 'var(--danger)',
                          }}
                        >
                          {result.ok ? <Check size={13} /> : <AlertTriangle size={13} />}
                          <span>{result.message}</span>
                        </div>
                      )}
                    </td>
                    <td><span className="stamp-badge neutral">{c.type}</span></td>
                    <td className="mono">{c.host ? `${c.host}:${c.port ?? ''}` : '—'}</td>
                    <td className="mono">{c.basePath}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="ghost"
                          onClick={() => testConnection(c.id)}
                          disabled={result === 'pending'}
                          title="Test connection"
                        >
                          {result === 'pending' ? (
                            <Loader2 size={15} className="spin" />
                          ) : (
                            <Wifi size={15} />
                          )}
                        </button>
                        <button className="ghost" onClick={() => openEditForm(c)} title="Edit">
                          <Pencil size={15} />
                        </button>
                        <button className="ghost" onClick={() => removeConnection(c.id)} title="Delete" style={{ color: 'var(--danger)' }}>
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
