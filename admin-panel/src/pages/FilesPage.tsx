import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileStack, FileText, Image, Trash2 } from 'lucide-react';
import { apiFetch } from '../services/api';

interface FileRecord {
  id: number;
  generatedName: string;
  originalName: string;
  type: 'document' | 'photo';
  place: string;
  path: string;
  createdAt: string;
}

export default function FilesPage() {
  const { t } = useTranslation();
  const [records, setRecords] = useState<FileRecord[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  async function load() {
    try {
      const qs = typeFilter ? `?type=${typeFilter}` : '';
      setRecords(await apiFetch<FileRecord[]>(`/files${qs}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file log');
    }
  }

  async function clearAll() {
    const scope = typeFilter ? t('files.clearScopeType', { type: typeFilter }) : t('files.clearScopeAll');
    if (!confirm(t('files.clearConfirm', { scope }))) return;
    setClearing(true);
    setError(null);
    try {
      const qs = typeFilter ? `?type=${typeFilter}` : '';
      const res = await apiFetch<{ deleted: number; failed: number }>(`/files${qs}`, { method: 'DELETE' });
      if (res.failed) setError(t('files.partialClearError', { deleted: res.deleted, failed: res.failed }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear file log');
    } finally {
      setClearing(false);
    }
  }

  useEffect(() => { load(); }, [typeFilter]);

  return (
    <div>
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">{t('files.eyebrow')}</span>
          <h1 className="page-title">{t('files.title')}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select style={{ width: 170 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">{t('files.allTypes')}</option>
            <option value="document">{t('files.document')}</option>
            <option value="photo">{t('files.photo')}</option>
          </select>
          <button type="button" onClick={clearAll} disabled={clearing || records.length === 0} title={t('files.clear')}>
            <Trash2 size={15} /> {clearing ? t('files.clearing') : t('files.clear')}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: records.length ? 8 : undefined }}>
        {records.length === 0 ? (
          <div className="empty-state">
            <FileStack size={32} strokeWidth={1.5} />
            <strong>{t('files.emptyTitle')}</strong>
            <span>{t('files.emptyBody')}</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('files.generatedName')}</th>
                <th>{t('files.type')}</th>
                <th>{t('files.place')}</th>
                <th className="mono">{t('files.path')}</th>
                <th>{t('files.uploaded')}</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{r.generatedName}</td>
                  <td>
                    <span className="stamp-badge neutral">
                      {r.type === 'document' ? <FileText size={12} /> : <Image size={12} />}
                      {r.type === 'document' ? t('files.document') : t('files.photo')}
                    </span>
                  </td>
                  <td>{r.place}</td>
                  <td className="mono">{r.path}</td>
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
