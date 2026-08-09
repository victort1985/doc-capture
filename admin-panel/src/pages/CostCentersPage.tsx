import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, X, Calendar } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { apiFetch } from '../services/api';

interface CostCenter { id: number; name: string; }
interface ReportRow {
  costCenterId: number | null; costCenterName: string;
  expenses: number; supplierInvoices: number; revenue: number; net: number;
}

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

export default function CostCentersPage() {
  const { t } = useTranslation();
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [report, setReport] = useState<ReportRow[]>([]);
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [from, setFrom] = useState(toDateStr(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(toDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)));

  async function load() {
    setLoading(true); setError(null);
    try {
      const [c, r] = await Promise.all([
        apiFetch<CostCenter[]>('/cost-centers'),
        apiFetch<ReportRow[]>(`/cost-centers/report?${new URLSearchParams({ from, to }).toString()}`),
      ]);
      setCenters(c);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [from, to]);

  async function addCenter() {
    if (!newName.trim()) return;
    try {
      await apiFetch('/cost-centers', { method: 'POST', body: JSON.stringify({ name: newName.trim() }) });
      setNewName('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    }
  }

  async function removeCenter(id: number, name: string) {
    if (!confirm(t('costCenters.deleteConfirm', { name }))) return;
    await apiFetch(`/cost-centers/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">{t('costCenters.eyebrow')}</div>
          <h1>{t('costCenters.title')}</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Calendar size={15} style={{ color: 'var(--ink-soft)' }} />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ color: 'var(--ink-soft)' }}>–</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t('costCenters.newPlaceholder')} style={{ maxWidth: 240 }} />
          <button type="button" onClick={addCenter}><Plus size={14} /> {t('costCenters.add')}</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {centers.map((c) => (
            <span key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-muted, #f0f0f0)', borderRadius: 14, padding: '4px 10px', fontSize: 13 }}>
              {c.name}
              <button onClick={() => removeCenter(c.id, c.name)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex' }}><X size={12} /></button>
            </span>
          ))}
          {centers.length === 0 && !loading && <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('costCenters.noneYet')}</span>}
        </div>
      </div>

      {report.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ width: '100%', height: Math.max(200, report.length * 50) }}>
            <ResponsiveContainer>
              <BarChart data={report} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #eee)" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="costCenterName" tick={{ fontSize: 12 }} width={110} />
                <Tooltip formatter={(v: any) => `₪${Number(v).toLocaleString()}`} />
                <Bar dataKey="net" radius={[0, 6, 6, 0]}>
                  {report.map((r, i) => <Cell key={i} fill={r.net >= 0 ? '#2E7D32' : '#C62828'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('costCenters.name')}</th>
              <th style={{ padding: '8px 12px' }}>{t('costCenters.revenue')}</th>
              <th style={{ padding: '8px 12px' }}>{t('costCenters.expenses')}</th>
              <th style={{ padding: '8px 12px' }}>{t('costCenters.supplierInvoices')}</th>
              <th style={{ padding: '8px 12px' }}>{t('costCenters.net')}</th>
            </tr>
          </thead>
          <tbody>
            {report.map((r) => (
              <tr key={r.costCenterId ?? 'unassigned'} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px', fontWeight: r.costCenterId === null ? 400 : 600, fontStyle: r.costCenterId === null ? 'italic' : 'normal', color: r.costCenterId === null ? 'var(--ink-soft)' : 'inherit' }}>
                  {r.costCenterId === null ? t('costCenters.unassigned') : r.costCenterName}
                </td>
                <td style={{ padding: '8px 12px' }}>₪{r.revenue.toLocaleString()}</td>
                <td style={{ padding: '8px 12px' }}>₪{r.expenses.toLocaleString()}</td>
                <td style={{ padding: '8px 12px' }}>₪{r.supplierInvoices.toLocaleString()}</td>
                <td style={{ padding: '8px 12px', fontWeight: 700, color: r.net >= 0 ? 'var(--success, green)' : 'var(--danger, crimson)' }}>₪{r.net.toLocaleString()}</td>
              </tr>
            ))}
            {report.length === 0 && !loading && (
              <tr><td colSpan={5} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('costCenters.noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
