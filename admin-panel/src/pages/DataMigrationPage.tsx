import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Upload, Download, ArrowLeft, FileSpreadsheet, CheckCircle2, XCircle,
  AlertTriangle, ChevronRight, X,
} from 'lucide-react';
import { apiFetch, apiFetchMultipart, apiFetchBlob, BASE_URL, getToken } from '../services/api';

interface AnalyzeResult {
  fileToken: string;
  detectedFormat: 'csv' | 'xlsx' | 'movein-short' | 'movein-detailed' | 'unknown';
  headers: string[];
  previewRows: Record<string, string>[];
  rowCount: number;
  suggestedMapping: Record<string, string>;
  moveinNote?: string;
}

interface JobStatus {
  id: string;
  status: 'running' | 'done' | 'failed';
  totalRows: number;
  processedRows: number;
  log: string[];
  result?: { imported?: number; failed?: { row: number; error: string }[]; fileName?: string; rowCount?: number };
  error?: string;
}

const CONTACT_FIELDS = ['firstName', 'lastName', 'phone', 'email', 'taxId', 'notes'] as const;

type Mode = 'landing' | 'import' | 'export';

export default function DataMigrationPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('landing');

  if (mode === 'landing') return <Landing onPick={setMode} t={t} />;
  if (mode === 'import') return <ImportWizard onBack={() => setMode('landing')} t={t} />;
  return <ExportFlow onBack={() => setMode('landing')} t={t} />;
}

function Landing({ onPick, t }: { onPick: (m: Mode) => void; t: (k: string, o?: any) => string }) {
  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('dataMigration.eyebrow')}</div><h1>{t('dataMigration.title')}</h1></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 8 }}>
        <button
          type="button"
          onClick={() => onPick('import')}
          style={{
            all: 'unset', cursor: 'pointer', background: 'linear-gradient(160deg, #1D3557 0%, #0E1642 100%)',
            borderRadius: 16, padding: '48px 32px', color: '#fff', textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            boxShadow: '0 4px 20px rgba(14,22,66,0.25)', transition: 'transform 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Upload size={40} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('dataMigration.importTitle')}</div>
          <div style={{ fontSize: 13.5, opacity: 0.85, maxWidth: 320 }}>{t('dataMigration.importHint')}</div>
        </button>

        <button
          type="button"
          onClick={() => onPick('export')}
          style={{
            all: 'unset', cursor: 'pointer', background: 'linear-gradient(160deg, #F2701C 0%, #C4530E 100%)',
            borderRadius: 16, padding: '48px 32px', color: '#fff', textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
            boxShadow: '0 4px 20px rgba(196,83,14,0.25)', transition: 'transform 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-3px)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
        >
          <div style={{ width: 88, height: 88, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Download size={40} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{t('dataMigration.exportTitle')}</div>
          <div style={{ fontSize: 13.5, opacity: 0.85, maxWidth: 320 }}>{t('dataMigration.exportHint')}</div>
        </button>
      </div>
    </div>
  );
}

function BackBar({ onBack, title, t }: { onBack: () => void; title: string; t: (k: string) => string }) {
  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="button" className="ghost" onClick={onBack}><ArrowLeft size={16} /> {t('common.back')}</button>
        <div><div className="eyebrow">{t('dataMigration.eyebrow')}</div><h1>{title}</h1></div>
      </div>
    </div>
  );
}

function JobProgress({ job, t }: { job: JobStatus; t: (k: string, o?: any) => string }) {
  const percent = job.totalRows > 0 ? Math.round((job.processedRows / job.totalRows) * 100) : job.status === 'done' ? 100 : 0;
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [job.log.length]);

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {job.status === 'running' && t('dataMigration.statusRunning')}
          {job.status === 'done' && <><CheckCircle2 size={15} color="#1a7f37" style={{ verticalAlign: 'middle' }} /> {t('dataMigration.statusDone')}</>}
          {job.status === 'failed' && <><XCircle size={15} color="#b3261e" style={{ verticalAlign: 'middle' }} /> {t('dataMigration.statusFailed')}</>}
        </span>
        <span style={{ fontSize: 12.5, color: 'var(--ink-soft)' }}>{job.processedRows} / {job.totalRows || '—'} ({percent}%)</span>
      </div>
      <div style={{ height: 8, background: '#eee', borderRadius: 4, overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ height: '100%', width: `${percent}%`, background: job.status === 'failed' ? '#b3261e' : '#1D3557', transition: 'width 0.3s' }} />
      </div>

      <div
        ref={logRef}
        style={{
          background: '#0E1642', color: '#c9d6e8', fontFamily: 'monospace', fontSize: 12,
          borderRadius: 8, padding: 12, height: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: 1.6,
        }}
      >
        {job.log.length === 0 ? t('dataMigration.logWaiting') : job.log.map((line, i) => <div key={i}>{line}</div>)}
      </div>

      {job.status === 'failed' && job.error && (
        <div className="error-banner" style={{ marginTop: 12 }}>{job.error}</div>
      )}
      {job.status === 'done' && job.result?.imported !== undefined && (
        <div className="card" style={{ marginTop: 12, padding: 12, background: 'var(--surface-muted)', fontSize: 13 }}>
          {t('dataMigration.importSummary', { imported: job.result.imported, failed: job.result.failed?.length ?? 0 })}
          {job.result.failed && job.result.failed.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingInlineStart: 18, fontSize: 12, color: 'var(--ink-soft)' }}>
              {job.result.failed.slice(0, 10).map((f, i) => <li key={i}>{t('dataMigration.rowError', { row: f.row, error: f.error })}</li>)}
              {job.result.failed.length > 10 && <li>… {t('dataMigration.andMore', { count: job.result.failed.length - 10 })}</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function useJobPolling(jobId: string | null): JobStatus | null {
  const [job, setJob] = useState<JobStatus | null>(null);
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let handle: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const status = await apiFetch<JobStatus>(`/data-migration/jobs/${jobId}`);
        if (cancelled) return;
        setJob(status);
        if (status.status === 'running') handle = setTimeout(poll, 1000);
      } catch {
        if (!cancelled) handle = setTimeout(poll, 2000);
      }
    }
    poll();
    return () => { cancelled = true; clearTimeout(handle); };
  }, [jobId]);
  return job;
}

// ============ IMPORT WIZARD ============

function ImportWizard({ onBack, t }: { onBack: () => void; t: (k: string, o?: any) => string }) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [category, setCategory] = useState<'client' | 'supplier'>('client');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJobPolling(jobId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setAnalyzing(true); setAnalyzeError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await apiFetchMultipart<AnalyzeResult>('/data-migration/import/analyze', formData);
      setAnalysis(result);
      setMapping(result.suggestedMapping);
      setStep(2);
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Failed to analyze file');
    } finally {
      setAnalyzing(false);
    }
  }

  async function runImport() {
    if (!analysis) return;
    try {
      const { jobId: id } = await apiFetch<{ jobId: string }>('/data-migration/import/run', {
        method: 'POST',
        body: JSON.stringify({ target: 'contacts', category, mapping, fileToken: analysis.fileToken }),
      });
      setJobId(id);
      setStep(3);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to start import');
    }
  }

  return (
    <div className="page">
      <BackBar onBack={onBack} title={t('dataMigration.importTitle')} t={t} />

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[0, 1, 2, 3].map((s) => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: step >= s ? 'var(--primary, #1D3557)' : '#e5e5e5' }} />
        ))}
      </div>

      {step === 0 && (
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>{t('dataMigration.step0Title')}</h2>
          <ol style={{ fontSize: 14, lineHeight: 1.9, paddingInlineStart: 22 }}>
            <li>{t('dataMigration.step0Instr1')}</li>
            <li>{t('dataMigration.step0Instr2')}</li>
            <li>{t('dataMigration.step0Instr3')}</li>
            <li>{t('dataMigration.step0Instr4')}</li>
          </ol>
          <div className="card" style={{ background: 'var(--surface-muted)', padding: 12, fontSize: 12.5, marginTop: 12 }}>
            {t('dataMigration.step0Hint')}
          </div>
          <button type="button" onClick={() => setStep(1)} style={{ marginTop: 16 }}>
            {t('dataMigration.continueToFile')} <ChevronRight size={15} />
          </button>
        </div>
      )}

      {step === 1 && (
        <div className="card" style={{ padding: 24 }}>
          <h2 style={{ marginTop: 0 }}>{t('dataMigration.step1Title')}</h2>
          <p style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>{t('dataMigration.step1Hint')}</p>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border, #ccc)', borderRadius: 12, padding: 40, textAlign: 'center',
              cursor: 'pointer', background: 'var(--surface-muted)',
            }}
          >
            <FileSpreadsheet size={40} style={{ opacity: 0.5, marginBottom: 10 }} />
            <div style={{ fontSize: 14, fontWeight: 600 }}>{analyzing ? t('dataMigration.analyzing') : t('dataMigration.chooseFile')}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>CSV, XLSX, DAT</div>
          </div>
          <input
            ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.dat,.txt" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
          {analyzeError && <div className="error-banner" style={{ marginTop: 12 }}>{analyzeError}</div>}
        </div>
      )}

      {step === 2 && analysis && (
        <div className="card" style={{ padding: 24 }}>
          {(analysis.detectedFormat === 'movein-short' || analysis.detectedFormat === 'movein-detailed') ? (
            <div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
                <AlertTriangle size={20} color="#F2701C" style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  <h3 style={{ margin: '0 0 6px' }}>{t('dataMigration.moveinDetectedTitle')}</h3>
                  <p style={{ fontSize: 13.5, margin: 0 }}>{analysis.moveinNote}</p>
                </div>
              </div>
              <button type="button" className="ghost" onClick={() => setStep(1)}>{t('dataMigration.chooseDifferentFile')}</button>
            </div>
          ) : (
            <div>
              <h2 style={{ marginTop: 0 }}>{t('dataMigration.step2Title')}</h2>
              <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>{t('dataMigration.rowsFound', { count: analysis.rowCount })}</p>

              <label>{t('dataMigration.category')}</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as 'client' | 'supplier')} style={{ marginBottom: 16, width: 220 }}>
                <option value="client">{t('phonebook.clients')}</option>
                <option value="supplier">{t('phonebook.suppliers')}</option>
              </select>

              <h3 style={{ fontSize: 14 }}>{t('dataMigration.mappingTitle')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                {CONTACT_FIELDS.map((field) => (
                  <div key={field} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <label style={{ width: 90, fontSize: 12.5, flexShrink: 0 }}>{t(`dataMigration.field_${field}`)}</label>
                    <select
                      value={mapping[field] ?? ''}
                      onChange={(e) => setMapping({ ...mapping, [field]: e.target.value })}
                      style={{ flex: 1 }}
                    >
                      <option value="">{t('dataMigration.notMapped')}</option>
                      {analysis.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <h3 style={{ fontSize: 14 }}>{t('dataMigration.previewTitle')}</h3>
              <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr>{analysis.headers.map((h) => <th key={h} style={{ padding: '4px 8px', textAlign: 'start', borderBottom: '1px solid var(--border,#ddd)' }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {analysis.previewRows.map((row, i) => (
                      <tr key={i}>{analysis.headers.map((h) => <td key={h} style={{ padding: '4px 8px', color: 'var(--ink-soft)' }}>{row[h]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="ghost" onClick={() => setStep(1)}>{t('common.back')}</button>
                <button type="button" onClick={runImport} disabled={!mapping.firstName || !mapping.phone}>
                  {t('dataMigration.startImport')}
                </button>
              </div>
              {(!mapping.firstName || !mapping.phone) && (
                <p style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 8 }}>{t('dataMigration.needNamePhone')}</p>
              )}
            </div>
          )}
        </div>
      )}

      {step === 3 && job && <JobProgress job={job} t={t} />}
    </div>
  );
}

// ============ EXPORT FLOW ============

function ExportFlow({ onBack, t }: { onBack: () => void; t: (k: string, o?: any) => string }) {
  const [entity, setEntity] = useState<'contacts' | 'warehouse'>('contacts');
  const [format, setFormat] = useState<'csv' | 'xlsx' | 'json'>('xlsx');
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJobPolling(jobId);

  async function runExport() {
    try {
      const { jobId: id } = await apiFetch<{ jobId: string }>('/data-migration/export', {
        method: 'POST',
        body: JSON.stringify({ entity, format }),
      });
      setJobId(id);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to start export');
    }
  }

  async function download() {
    if (!jobId) return;
    try {
      const url = await apiFetchBlob(`/data-migration/jobs/${jobId}/download`);
      const a = document.createElement('a');
      a.href = url;
      a.download = job?.result?.fileName ?? 'export';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Download failed');
    }
  }

  return (
    <div className="page">
      <BackBar onBack={onBack} title={t('dataMigration.exportTitle')} t={t} />

      {!jobId && (
        <div className="card" style={{ padding: 24 }}>
          <label>{t('dataMigration.whatToExport')}</label>
          <select value={entity} onChange={(e) => setEntity(e.target.value as 'contacts' | 'warehouse')} style={{ marginBottom: 16, width: 260 }}>
            <option value="contacts">{t('dataMigration.entityContacts')}</option>
            <option value="warehouse">{t('dataMigration.entityWarehouse')}</option>
          </select>

          <label>{t('dataMigration.fileFormat')}</label>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            {(['xlsx', 'csv', 'json'] as const).map((f) => (
              <button key={f} type="button" className={format === f ? '' : 'ghost'} onClick={() => setFormat(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          <button type="button" onClick={runExport}>{t('dataMigration.startExport')}</button>
        </div>
      )}

      {jobId && job && (
        <>
          <JobProgress job={job} t={t} />
          {job.status === 'done' && (
            <button type="button" onClick={download} style={{ marginTop: 16 }}>
              <Download size={15} /> {t('dataMigration.downloadFile')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
