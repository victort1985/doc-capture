import { useEffect, useState } from 'react';
import { RefreshCw, ShieldOff, ShieldCheck, Trash2, Smartphone } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Device {
  id: number;
  deviceId: string;
  platform?: string;
  revoked: boolean;
  lastUser?: { id: number; username: string };
  firstSeenAt: string;
  lastSeenAt: string;
}

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setDevices(await apiFetch<Device[]>('/devices'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load devices');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function revoke(id: number) {
    if (!confirm('Revoke this device? It will be signed out and blocked from logging in again until re-enabled — this frees up a slot for a new device.')) return;
    await apiFetch(`/devices/${id}/revoke`, { method: 'POST' });
    load();
  }
  async function unrevoke(id: number) {
    await apiFetch(`/devices/${id}/unrevoke`, { method: 'POST' });
    load();
  }
  async function remove(id: number) {
    if (!confirm('Permanently remove this device record?')) return;
    await apiFetch(`/devices/${id}`, { method: 'DELETE' });
    load();
  }

  const activeCount = devices.filter((d) => !d.revoked).length;

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">LICENSE</div><h1>Devices</h1></div>
        <button type="button" onClick={load} disabled={loading}><RefreshCw size={15} /> {loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      <div className="card" style={{ marginBottom: 16, padding: '10px 16px', background: 'var(--surface-muted)', fontSize: 13 }}>
        Each row is one mobile app installation. Your plan's device limit counts active (non-revoked) devices —
        revoke one to free up a slot for a new device. Currently <b>{activeCount}</b> active.
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>Device</th>
              <th style={{ padding: '8px 12px' }}>Last user</th>
              <th style={{ padding: '8px 12px' }}>Platform</th>
              <th style={{ padding: '8px 12px' }}>First seen</th>
              <th style={{ padding: '8px 12px' }}>Last seen</th>
              <th style={{ padding: '8px 12px' }}>Status</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12 }}>
                  <Smartphone size={13} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                  {d.deviceId.slice(0, 12)}…
                </td>
                <td style={{ padding: '8px 12px' }}>{d.lastUser?.username ?? '—'}</td>
                <td style={{ padding: '8px 12px' }}>{d.platform ?? '—'}</td>
                <td style={{ padding: '8px 12px' }}>{new Date(d.firstSeenAt).toLocaleDateString()}</td>
                <td style={{ padding: '8px 12px' }}>{new Date(d.lastSeenAt).toLocaleString()}</td>
                <td style={{ padding: '8px 12px', color: d.revoked ? 'var(--danger)' : 'green' }}>{d.revoked ? 'Revoked' : 'Active'}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  {d.revoked ? (
                    <button type="button" onClick={() => unrevoke(d.id)} title="Re-enable" style={{ marginRight: 8, color: 'green' }}><ShieldCheck size={15} /></button>
                  ) : (
                    <button type="button" onClick={() => revoke(d.id)} title="Revoke" style={{ marginRight: 8, color: 'var(--danger)' }}><ShieldOff size={15} /></button>
                  )}
                  <button type="button" onClick={() => remove(d.id)} title="Delete record" style={{ color: 'var(--ink-soft)' }}><Trash2 size={15} /></button>
                </td>
              </tr>
            ))}
            {devices.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>No devices have logged in yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
