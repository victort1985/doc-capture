import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Landmark, Upload, CheckCircle2, ExternalLink } from 'lucide-react';
import { apiFetch, apiFetchMultipart } from '../services/api';

interface BankReference {
  code: string;
  name: string;
  nameEn?: string;
  status: 'active' | 'historical' | 'special';
}

interface ImportResult {
  imported: number;
  failed: { row: number; error: string }[];
}

export default function BankDataPage() {
  const { t } = useTranslation();
  const [banks, setBanks] = useState<BankReference[]>([]);
  const [branchCount, setBranchCount] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [b, c] = await Promise.all([
        apiFetch<BankReference[]>('/banks'),
        apiFetch<{ count: number }>('/banks/branches/count'),
      ]);
      setBanks(b);
      setBranchCount(c.count);
    } catch {
      // Reference-data page — a failed load here isn't worth an
      // error banner over; the picker components elsewhere already
      // surface their own errors if the endpoints are genuinely down.
    }
  }

  useEffect(() => { load(); }, []);

  async function handleFile(file: File) {
    setUploading(true); setError(null); setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await apiFetchMultipart<ImportResult>('/banks/branches/import-csv', formData);
      setResult(res);
      const c = await apiFetch<{ count: number }>('/banks/branches/count');
      setBranchCount(c.count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('bankData.eyebrow')}</div><h1>{t('bankData.title')}</h1></div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Landmark size={20} />
          <h2 style={{ margin: 0, fontSize: 15 }}>{t('bankData.banksTitle')}</h2>
        </div>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginBottom: 12 }}>
          {t('bankData.banksHint', { count: banks.length })}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, fontSize: 12.5 }}>
          {banks.map((b) => (
            <div key={b.code} style={{ padding: '6px 10px', border: '1px solid var(--border,#eee)', borderRadius: 6 }}>
              <strong>{b.code}</strong> — {b.name}
              {b.status !== 'active' && <span style={{ color: 'var(--ink-soft)' }}> ({t(`banks.status_${b.status}`)})</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <Upload size={20} />
          <h2 style={{ margin: 0, fontSize: 15 }}>{t('bankData.branchesTitle')}</h2>
        </div>

        <p style={{ fontSize: 13, marginBottom: 6 }}>
          {branchCount === null ? t('bankData.loadingCount') : t('bankData.currentCount', { count: branchCount })}
        </p>

        <div className="card" style={{ background: 'var(--surface-muted)', padding: 14, fontSize: 12.5, marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px' }}>{t('bankData.howToGetFile')}</p>
          <ol style={{ margin: '0 0 8px', paddingInlineStart: 18, lineHeight: 1.8 }}>
            <li>{t('bankData.step1')}</li>
            <li>{t('bankData.step2')}</li>
            <li>{t('bankData.step3')}</li>
          </ol>
          <a
            href="https://roeahesbon.com/wp-content/uploads/2023/07/רשימת-בנקים-בישראל.xlsx"
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {t('bankData.exampleSource')} <ExternalLink size={13} />
          </a>
        </div>

        <label
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer',
            border: '1px dashed var(--border,#ccc)', borderRadius: 8, padding: '10px 16px', fontSize: 13,
          }}
        >
          <Upload size={15} />
          {uploading ? t('bankData.importing') : t('bankData.chooseCsv')}
          <input
            type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} disabled={uploading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
        </label>

        {error && <div className="error-banner" style={{ marginTop: 12 }}>{error}</div>}

        {result && (
          <div className="card" style={{ marginTop: 14, padding: 12, background: 'var(--surface-muted)', fontSize: 13 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={15} color="#1a7f37" />
              {t('bankData.importSummary', { imported: result.imported, failed: result.failed.length })}
            </div>
            {result.failed.length > 0 && (
              <ul style={{ margin: '8px 0 0', paddingInlineStart: 18, fontSize: 12, color: 'var(--ink-soft)' }}>
                {result.failed.slice(0, 10).map((f, i) => <li key={i}>{t('bankData.rowError', { row: f.row, error: f.error })}</li>)}
                {result.failed.length > 10 && <li>… {t('bankData.andMore', { count: result.failed.length - 10 })}</li>}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
