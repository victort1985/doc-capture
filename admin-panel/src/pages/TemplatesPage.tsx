import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, Trash2, FileSliders } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Template {
  id: number;
  name: string;
  pattern: string;
  appliesTo: 'document' | 'photo' | 'both' | 'phonebook';
}

const EMPTY_FORM = { name: '', pattern: '{date}_{place}_{docType}_{counter}', appliesTo: 'both' };
const PLACEHOLDERS = ['{date}', '{time}', '{place}', '{username}', '{docType}', '{counter}', '{uuid}'];
const PHONEBOOK_PLACEHOLDERS = ['{organization}', '{city}', '{position}', '{firstName}', '{lastName}', '{year}'];
const PHONEBOOK_DEFAULT_PATTERN = '{organization}_{city}_{position}_{firstName}_{lastName}_{year}';

export default function TemplatesPage() {
  const { t } = useTranslation();
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
    if (!confirm(t('templates.deleteConfirm'))) return;
    await apiFetch(`/templates/${id}`, { method: 'DELETE' });
    setTemplates((prev: any[]) => prev.filter((x: any) => x.id !== id));
  }

  return (
    <div>
      <div className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span className="eyebrow">{t('templates.eyebrow')}</span>
          <h1 className="page-title">{t('templates.title')}</h1>
        </div>
        <button onClick={() => setShowForm((v) => !v)}>
          {showForm ? <><X size={16} /> {t('common.cancel')}</> : <><Plus size={16} /> {t('templates.newTemplate')}</>}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {showForm && (
        <form className="card form-card" onSubmit={createTemplate}>
          <div className="form-grid">
            <div>
              <label>{t('common.name')}</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label>{t('templates.appliesTo')}</label>
              <select
                value={form.appliesTo}
                onChange={(e) => {
                  const appliesTo = e.target.value;
                  setForm({
                    ...form,
                    appliesTo,
                    // Switching into/out of "Phone book" swaps the default
                    // pattern too, since the placeholder sets don't mix —
                    // only auto-replace if the field still has the default
                    // value for the OTHER kind (don't clobber a custom edit).
                    pattern:
                      appliesTo === 'phonebook' && form.pattern === EMPTY_FORM.pattern
                        ? PHONEBOOK_DEFAULT_PATTERN
                        : appliesTo !== 'phonebook' && form.pattern === PHONEBOOK_DEFAULT_PATTERN
                          ? EMPTY_FORM.pattern
                          : form.pattern,
                  });
                }}
              >
                <option value="both">{t('templates.both')}</option>
                <option value="document">{t('files.document')}</option>
                <option value="photo">{t('files.photo')}</option>
                <option value="phonebook">{t('templates.phonebook')}</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label>{t('templates.pattern')}</label>
              <input
                className="mono"
                value={form.pattern}
                onChange={(e) => setForm({ ...form, pattern: e.target.value })}
                required
              />
              <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8, fontFamily: 'var(--font-mono)' }}>
                {(form.appliesTo === 'phonebook' ? PHONEBOOK_PLACEHOLDERS : PLACEHOLDERS).join('   ')}
              </p>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit"><Plus size={16} /> {t('templates.createTemplate')}</button>
          </div>
        </form>
      )}

      <div className="card" style={{ padding: templates.length ? 8 : undefined }}>
        {templates.length === 0 ? (
          <div className="empty-state">
            <FileSliders size={32} strokeWidth={1.5} />
            <strong>{t('templates.emptyTitle')}</strong>
            <span>{t('templates.emptyBody')}</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{t('common.name')}</th>
                <th>{t('templates.appliesTo')}</th>
                <th className="mono">{t('templates.pattern')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr key={tpl.id}>
                  <td>{tpl.name}</td>
                  <td className="mono">{tpl.appliesTo}</td>
                  <td className="mono">{tpl.pattern}</td>
                  <td>
                    <div className="row-actions">
                      <button className="ghost" onClick={() => removeTemplate(tpl.id)} title={t('common.delete')} style={{ color: 'var(--danger)' }}>
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
