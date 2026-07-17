import { useEffect, useState } from 'react';
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
    const scope = typeFilter ? `all "${typeFilter}" entries` : 'the entire file log';
    if (!confirm(`Clear ${scope}? This deletes the underlying files too — this cannot be undone.`)) return;
    setClearing(true);
    setError(null);
    try {
      const qs = typeFilter ? `?type=${typeFilter}` : '';
      const res = await apiFetch<{ deleted: number; failed: number }>(`/files${qs}`, { method: 'DELETE' });
      if (res.failed) setError(`Cleared ${res.deleted}, but ${res.failed} file(s) could not be removed from storage and were kept.`);
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
          <span className="eyebrow">Activity</span>
          <h1 className="page-title">File log</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select style={{ width: 170 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">All types</option>
            <option value="document">Document</option>
            <option value="photo">Photo</option>
          </select>
          <button type="button" onClick={clearAll} disabled={clearing || records.length === 0} title="Clear file log">
            <Trash2 size={15} /> {clearing ? 'Clearing…' : 'Clear'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="card" style={{ padding: records.length ? 8 : undefined }}>
        {records.length === 0 ? (
          <div className="empty-state">
            <FileStack size={32} strokeWidth={1.5} />
            <strong>No uploads yet</strong>
            <span>Captured documents and photos will show up here once staff start uploading.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Generated name</th>
                <th>Type</th>
                <th>Place</th>
                <th className="mono">Path</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td>{r.generatedName}</td>
                  <td>
                    <span className="stamp-badge neutral">
                      {r.type === 'document' ? <FileText size={12} /> : <Image size={12} />}
                      {r.type}
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
