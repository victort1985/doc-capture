import { useEffect, useState } from 'react';
import { FileStack, FileText, Image } from 'lucide-react';
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

  async function load() {
    try {
      const qs = typeFilter ? `?type=${typeFilter}` : '';
      setRecords(await apiFetch<FileRecord[]>(`/files${qs}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file log');
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
        <select style={{ width: 170 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="document">Document</option>
          <option value="photo">Photo</option>
        </select>
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
