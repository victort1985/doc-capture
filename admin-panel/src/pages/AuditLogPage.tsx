import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Filter } from 'lucide-react';
import { apiFetch } from '../services/api';

interface AuditEntry {
  id: number;
  username?: string;
  method: string;
  path: string;
  resourceType?: string;
  resourceId?: string;
  statusCode: number;
  ipAddress?: string;
  createdAt: string;
}

const METHOD_COLORS: Record<string, string> = {
  POST: '#1a7f37', PATCH: '#9a6700', PUT: '#9a6700', DELETE: '#cf222e',
};

export default function AuditLogPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [resourceType, setResourceType] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams();
      if (resourceType) qs.set('resourceType', resourceType);
      if (resourceId) qs.set('resourceId', resourceId);
      setEntries(await apiFetch<AuditEntry[]>(`/audit-log?${qs.toString()}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('auditLog.eyebrow')}</div><h1>{t('auditLog.title')}</h1></div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <Filter size={15} style={{ color: 'var(--ink-soft)' }} />
        <input
          placeholder={t('auditLog.resourceTypePlaceholder')}
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value)}
          style={{ width: 140 }}
        />
        <input
          placeholder={t('auditLog.resourceIdPlaceholder')}
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
          style={{ width: 100 }}
        />
        <button type="button" onClick={load}>{t('auditLog.apply')}</button>
        {(resourceType || resourceId) && (
          <button type="button" className="ghost" onClick={() => { setResourceType(''); setResourceId(''); setTimeout(load, 0); }}>
            {t('auditLog.clear')}
          </button>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <p>{t('common.loading')}</p>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('auditLog.when')}</th>
              <th style={{ padding: '8px 12px' }}>{t('auditLog.user')}</th>
              <th style={{ padding: '8px 12px' }}>{t('auditLog.action')}</th>
              <th style={{ padding: '8px 12px' }}>{t('auditLog.resource')}</th>
              <th style={{ padding: '8px 12px' }}>{t('auditLog.status')}</th>
              <th style={{ padding: '8px 12px' }}>{t('auditLog.ip')}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px', fontSize: 12.5, whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString()}</td>
                <td style={{ padding: '8px 12px' }}>{e.username ?? '—'}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{ color: METHOD_COLORS[e.method] ?? 'inherit', fontWeight: 700, fontSize: 12 }}>{e.method}</span>
                  {' '}<span style={{ fontFamily: 'monospace', fontSize: 12.5 }}>{e.path}</span>
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12.5 }}>{e.resourceType ? `${e.resourceType}${e.resourceId ? ` #${e.resourceId}` : ''}` : '—'}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{ color: e.statusCode >= 400 ? 'var(--danger, crimson)' : 'var(--success, green)', fontWeight: 600 }}>{e.statusCode}</span>
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: 'var(--ink-soft)' }}>{e.ipAddress ?? '—'}</td>
              </tr>
            ))}
            {entries.length === 0 && !loading && (
              <tr><td colSpan={6} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('auditLog.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
