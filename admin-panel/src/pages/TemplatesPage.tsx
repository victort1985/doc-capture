import { useEffect, useState } from 'react';
import { Plus, X, Trash2, FileSliders, FileText, BarChart2 } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Template {
  id: number;
  name: string;
  pattern: string;
  appliesTo: 'document' | 'photo' | 'both' | 'phonebook';
}

interface PdfSettings {
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyFax?: string;
  companyMobile?: string;
  termsText?: string;
  logoBase64?: string;
}

interface ReportRow {
  userId: number;
  username: string;
  callsWorked: number;
  totalSeconds: number;
  callsClosed: number;
}

const EMPTY_FORM = { name: '', pattern: '{date}_{place}_{docType}_{counter}', appliesTo: 'both' };
const PLACEHOLDERS = ['{date}', '{time}', '{place}', '{username}', '{docType}', '{counter}', '{uuid}'];
const PHONEBOOK_PLACEHOLDERS = ['{organization}', '{city}', '{position}', '{firstName}', '{lastName}', '{year}'];
const PHONEBOOK_DEFAULT_PATTERN = '{organization}_{city}_{position}_{firstName}_{lastName}_{year}';

function fmt(sec: number) {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function NamingTab() {
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
    setTemplates((prev) => prev.filter((x) => x.id !== id));
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
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
              <select
                value={form.appliesTo}
                onChange={(e) => {
                  const appliesTo = e.target.value;
                  setForm({
                    ...form,
                    appliesTo,
                    pattern:
                      appliesTo === 'phonebook' && form.pattern === EMPTY_FORM.pattern
                        ? PHONEBOOK_DEFAULT_PATTERN
                        : appliesTo !== 'phonebook' && form.pattern === PHONEBOOK_DEFAULT_PATTERN
                          ? EMPTY_FORM.pattern
                          : form.pattern,
                  });
                }}
              >
                <option value="both">Both</option>
                <option value="document">Document</option>
                <option value="photo">Photo</option>
                <option value="phonebook">Phone book</option>
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
                {(form.appliesTo === 'phonebook' ? PHONEBOOK_PLACEHOLDERS : PLACEHOLDERS).join('   ')}
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

function PdfTab() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<PdfSettings>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PdfSettings>('/delivery-note-settings').then(setSettings).catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const orgId = user?.organizationId;
      const url = orgId ? `/delivery-note-settings/${orgId}` : '/delivery-note-settings/1';
      await apiFetch(url, { method: 'PUT', body: JSON.stringify(settings) });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function field(label: string, key: keyof PdfSettings, multiline = false) {
    return (
      <div key={key}>
        <label>{label}</label>
        {multiline ? (
          <textarea
            rows={4}
            value={(settings[key] as string) ?? ''}
            onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
            style={{ resize: 'vertical' }}
          />
        ) : (
          <input
            value={(settings[key] as string) ?? ''}
            onChange={(e) => setSettings({ ...settings, [key]: e.target.value })}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {error && <div className="error-banner">{error}</div>}
      {saved && <div className="success-banner" style={{ background: 'var(--success-wash, #e6f9ee)', color: 'var(--success, #1a7f4b)', padding: '10px 16px', borderRadius: 8, marginBottom: 12 }}>Settings saved.</div>}
      <form className="card form-card" onSubmit={save}>
        <div className="form-grid">
          {field('Company name', 'companyName')}
          {field('Company address', 'companyAddress')}
          {field('Phone', 'companyPhone')}
          {field('Fax', 'companyFax')}
          {field('Mobile', 'companyMobile')}
          <div style={{ gridColumn: '1 / -1' }}>{field('Terms text (shown at bottom of PDF)', 'termsText', true)}</div>
        </div>
        <div className="form-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save PDF settings'}
          </button>
        </div>
      </form>
      <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 8 }}>
        These settings control the company header printed on delivery note and warehouse transfer PDFs.
        Upload a logo from the <strong>Delivery note settings</strong> page.
      </p>
    </div>
  );
}

function ReportsTab() {
  const [tab, setTab] = useState<'work' | 'warehouse'>('work');
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'all'>('month');
  const [workData, setWorkData] = useState<{ byUser: ReportRow[]; totals: Record<string, number> } | null>(null);
  const [warehouseData, setWarehouseData] = useState<{ rows: any[] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      if (tab === 'work') {
        const q = new URLSearchParams({ period });
        setWorkData(await apiFetch(`/reports/work?${q}`));
      } else {
        const q = new URLSearchParams({ period });
        const data = await apiFetch<{ summary: any[] }>(`/reports/warehouse?${q}`);
        setWarehouseData({ rows: data.summary ?? [] });
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [tab, period]);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px',
    borderRadius: 6,
    border: 'none',
    cursor: 'pointer',
    fontWeight: active ? 700 : 400,
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#fff' : 'var(--ink)',
    fontSize: 13,
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface-2, #f4f5f7)', borderRadius: 8, padding: 4 }}>
          <button style={tabStyle(tab === 'work')} onClick={() => setTab('work')}>Work</button>
          <button style={tabStyle(tab === 'warehouse')} onClick={() => setTab('warehouse')}>Warehouse</button>
        </div>
        <select value={period} onChange={(e) => setPeriod(e.target.value as any)} style={{ fontSize: 13, padding: '4px 8px' }}>
          <option value="day">Today</option>
          <option value="week">This week</option>
          <option value="month">This month</option>
          <option value="year">This year</option>
          <option value="all">All time</option>
        </select>
        <button onClick={load} disabled={loading} style={{ fontSize: 13, padding: '4px 12px' }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {tab === 'work' && workData && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Calls worked</th>
                <th>Calls closed</th>
                <th>Time worked</th>
              </tr>
            </thead>
            <tbody>
              {workData.byUser.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 24 }}>No data for period</td></tr>
              ) : workData.byUser.map((r) => (
                <tr key={r.userId}>
                  <td>{r.username}</td>
                  <td>{r.callsWorked}</td>
                  <td>{r.callsClosed}</td>
                  <td>{fmt(r.totalSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'warehouse' && warehouseData && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Barcode</th>
                <th>IN</th>
                <th>OUT</th>
                <th>Transactions</th>
              </tr>
            </thead>
            <tbody>
              {warehouseData.rows.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-soft)', padding: 24 }}>No data for period</td></tr>
              ) : warehouseData.rows.map((r: any, i: number) => (
                <tr key={i}>
                  <td>{r.name}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{r.barcode}</td>
                  <td>{r.totalIn ?? 0}</td>
                  <td>{r.totalOut ?? 0}</td>
                  <td>{r.txCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function TemplatesPage() {
  const [tab, setTab] = useState<'naming' | 'pdf' | 'reports'>('naming');

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontWeight: active ? 700 : 400, fontSize: 14,
    background: active ? 'var(--primary)' : 'transparent',
    color: active ? '#fff' : 'var(--ink)',
  });

  return (
    <div>
      <div className="topbar">
        <span className="eyebrow">Documents</span>
        <h1 className="page-title">Templates</h1>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: 'var(--surface-2, #f4f5f7)', borderRadius: 10, padding: 6, width: 'fit-content' }}>
        <button style={tabStyle(tab === 'naming')} onClick={() => setTab('naming')}>
          <FileSliders size={15} /> Naming
        </button>
        <button style={tabStyle(tab === 'pdf')} onClick={() => setTab('pdf')}>
          <FileText size={15} /> PDF
        </button>
        <button style={tabStyle(tab === 'reports')} onClick={() => setTab('reports')}>
          <BarChart2 size={15} /> Reports
        </button>
      </div>

      {tab === 'naming' && <NamingTab />}
      {tab === 'pdf' && <PdfTab />}
      {tab === 'reports' && <ReportsTab />}
    </div>
  );
}
