import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Save, Trash2, RefreshCw, HardDriveDownload } from 'lucide-react';
import { apiFetch, apiFetchBlob, BASE_URL, getToken } from '../services/api';

interface BackupFileInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export default function BackupPage() {
  const { t } = useTranslation();
  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      setBackups(await apiFetch<BackupFileInfo[]>('/backup'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load backups');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function createNow() {
    setCreating(true); setError(null); setNotice(null);
    try {
      const info = await apiFetch<BackupFileInfo>('/backup', { method: 'POST' });
      setNotice(t('backup.createdSuccess', { filename: info.filename }));
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create backup');
    } finally { setCreating(false); }
  }

  // "Save As" — triggers the browser's own save dialog by creating a
  // temporary anchor with a blob URL, rather than just window.open()
  // (which would try to display a gzip file inline instead of
  // downloading it in most browsers).
  async function saveAs(filename: string) {
    setError(null);
    try {
      const url = await apiFetchBlob(`/backup/${encodeURIComponent(filename)}/download`);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace(/\.enc$/, '');
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to download backup');
    }
  }

  async function remove(filename: string) {
    if (!confirm(t('backup.confirmDelete', { filename }))) return;
    setError(null);
    try {
      await fetch(`${BASE_URL}/backup/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete backup');
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('backup.eyebrow')}</div><h1>{t('backup.title')}</h1></div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="ghost" onClick={load} disabled={loading}>
            <RefreshCw size={15} /> {t('common.refresh')}
          </button>
          <button type="button" onClick={createNow} disabled={creating}>
            <Save size={15} /> {creating ? t('backup.creating') : t('backup.createNow')}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, fontSize: 13 }}>
        {t('backup.disclaimer')}
      </div>

      {notice && <div style={{ background: '#e6f4ea', color: '#1a7f37', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{notice}</div>}
      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('backup.filename')}</th>
              <th style={{ padding: '8px 12px' }}>{t('backup.created')}</th>
              <th style={{ padding: '8px 12px' }}>{t('backup.size')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.filename} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 12.5 }}>{b.filename}</td>
                <td style={{ padding: '8px 12px' }}>{new Date(b.createdAt).toLocaleString()}</td>
                <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>{formatSize(b.sizeBytes)}</td>
                <td style={{ padding: '8px 12px' }}>
                  <button type="button" className="ghost" onClick={() => saveAs(b.filename)} title={t('backup.saveAs')} style={{ marginInlineEnd: 6 }}>
                    <HardDriveDownload size={15} />
                  </button>
                  <button type="button" className="ghost" onClick={() => remove(b.filename)} title={t('common.delete')}>
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {backups.length === 0 && !loading && (
              <tr><td colSpan={4} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('backup.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
