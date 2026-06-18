import { useEffect, useState } from 'react';
import { Plus, X, Trash2, FileSliders } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Template {
  id: number;
  name: string;
  pattern: string;
  appliesTo: 'document' | 'photo' | 'both';
}

const EMPTY_FORM = { name: '', pattern: '{date}_{place}_{docType}_{counter}', appliesTo: 'both' };
const PLACEHOLDERS = ['{date}', '{time}', '{place}', '{username}', '{docType}', '{counter}', '{uuid}'];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    try {
      setTemplates(await apiFetch<Template[]>('/templates'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load templates');
    }
  }

  useEffect(() => { load(); }, []);

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/templates', { method: 'POST', body: JSON.stringify(form) });
      setForm(EMPTY_FORM);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create template');
    }
  }

  async function removeTemplate(id: number) {
    if (!confirm('Delete this template?')) return;
    await apiFetch(`/templates/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">File naming</span>
          <h1 className="page-title">Naming templates</h1>
        </div>
        <button onClick={() => setShowForm((v) => !v)}>
          {showForm ? <><X size={16} /> Cancel</> : <><Plus size={16} /> New template</>}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={createTemplate}>
          <div className="form-grid">
            <div>
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label>Applies to</label>
              <select value={form.appliesTo} onChange={(e) => setForm({ ...form, appliesTo: e.target.value })}>
                <option value="both">Both</option>
                <option value="document">Document</option>
                <option value="photo">Photo</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>Pattern</label>
              <input
                className="mono"
                value={form.pattern}
                onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                required
              />
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                {PLACEHOLDERS.join('   ')}
              </p>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit"><Plus size={16} /> Create template</button>
          </div>
        </form>
      )}

      <div className="card" style={{ padding: templates.length ? 8 : undefined }}>
        {templates.length === 0 ? (
          <div className="empty-state">
            <FileSliders size={32} strokeWidth={1.5} />
            <strong>No templates yet</strong>
            <span>Define how captured files get named before they're stored.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Applies to</th>
                <th className="mono">Pattern</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td className="mono">{t.appliesTo}</td>
                  <td className="mono">{t.pattern}</td>
                  <td>
                    <div className="row-actions">
                      <button className="ghost" onClick={() => removeTemplate(t.id)} title="Delete" style={{ color: 'var(--danger)' }}>
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
