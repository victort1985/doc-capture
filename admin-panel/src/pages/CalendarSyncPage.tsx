import { useEffect, useRef, useState } from 'react';
import { Calendar, RefreshCw, Copy, Check, ExternalLink, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

interface IcsData { token: string | null; url: string | null; }
interface ImportResult { imported: number; skipped: number; errors: string[]; }
interface Org { id: number; name: string; }

export default function CalendarSyncPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<IcsData | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selOrgId, setSelOrgId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const baseUrl = window.location.origin;

  const [googleStatus, setGoogleStatus] = useState<{ connectedEmail?: string; lastSyncedAt?: string } | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);

  useEffect(() => {
    load();
    apiFetch<Org[]>('/organizations')
      .then(os => { setOrgs(os); if (os.length) setSelOrgId(os[0].id); })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'connected') {
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('google') === 'error') {
      setError(params.get('message') || 'Failed to connect Google Calendar');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Fires for a super-admin once they have (or change) an org selection —
  // a regular org-scoped admin never gets a selOrgId at all (the
  // organizations list is super-admin only), so their ics-token/
  // Google-status already came from the unconditional load() above,
  // scoped server-side to their own org via the JWT.
  useEffect(() => {
    if (selOrgId != null) {
      load();
      loadGoogleStatus();
    }
  }, [selOrgId]);

  async function loadGoogleStatus() {
    try {
      const s = await apiFetch<{ connectedEmail: string | null; lastSyncedAt: string | null }>(`/calendar/google/status?organizationId=${selOrgId}`);
      setGoogleStatus({ connectedEmail: s.connectedEmail ?? undefined, lastSyncedAt: s.lastSyncedAt ?? undefined });
    } catch (e) { /* non-fatal — leave card in "not connected" state */ }
  }

  async function connectGoogle() {
    if (!selOrgId) { setError(t('calendarSync.selectOrgFirst')); return; }
    setConnecting(true);
    try {
      const { url } = await apiFetch<{ url: string | null }>(`/calendar/google/auth-url?organizationId=${selOrgId}`);
      if (url) window.location.href = url;
      else setError(t('calendarSync.noOrgSelected'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start Google connection');
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectGoogle() {
    try {
      await apiFetch(`/calendar/google/disconnect?organizationId=${selOrgId}`, { method: 'POST' });
      setGoogleStatus(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to disconnect');
    }
  }

  async function syncNow() {
    setSyncingNow(true);
    try {
      await apiFetch(`/calendar/google/sync-now?organizationId=${selOrgId}`, { method: 'POST' });
      await loadGoogleStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncingNow(false);
    }
  }

  async function load() {
    try {
      setError(null);
      const qs = selOrgId != null ? `?organizationId=${selOrgId}` : '';
      const d = await apiFetch<IcsData>(`/calendar/ics-token${qs}`);
      setData(d);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }

  function fullUrl() {
    return data?.url ? `${baseUrl}${data.url}` : '';
  }

  async function copy() {
    await navigator.clipboard.writeText(fullUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function rotate() {
    if (!confirm(t('calendarSync.rotateConfirm'))) return;
    setRotating(true);
    try {
      const qs = selOrgId != null ? `?organizationId=${selOrgId}` : '';
      const d = await apiFetch<IcsData>(`/calendar/ics-token/rotate${qs}`, { method: 'POST' });
      setData(d);
    } finally { setRotating(false); }
  }

  async function importFile(file: File) {
    if (!file.name.endsWith('.ics')) {
      setError(t('calendarSync.selectIcsFile'));
      return;
    }
    if (!selOrgId) {
      setError(t('calendarSync.selectOrgFirst'));
      return;
    }
    setImporting(true); setImportResult(null); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('organizationId', String(selOrgId));
      const result = await apiFetch<ImportResult>(`/calendar/import-ics?organizationId=${selOrgId}`, { method: 'POST', body: fd });
      setImportResult(result);
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed'); }
    finally { setImporting(false); }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) importFile(f);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) importFile(f);
  }

  return (
    <div>
      <div className="topbar">
        <div><span className="eyebrow">{t('calendarSync.eyebrow')}</span><h1 className="page-title">{t('calendarSync.title')}</h1></div>
      </div>

      {error && <div className="error-banner"><AlertCircle size={15} /> {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── LEFT: Export (subscribe) ──────────────────────────────────── */}
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <Calendar size={20} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0 }}>{t('calendarSync.subscribeTitle')}</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
              {t('calendarSync.subscribeExplanation')}
            </p>

            {data?.url ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input readOnly value={fullUrl()} style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, background: 'var(--surface-muted)' }} onClick={e => (e.target as HTMLInputElement).select()} />
                  <button onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? t('calendarSync.copied') : t('calendarSync.copy')}</button>
                </div>
                <button className="ghost" onClick={rotate} disabled={rotating} style={{ fontSize: 12, color: 'var(--danger)' }}>
                  <RefreshCw size={12} /> {rotating ? t('calendarSync.rotating') : t('calendarSync.rotateToken')}
                </button>
              </>
            ) : error ? (
              <div style={{ color: 'var(--danger, crimson)', fontSize: 13 }}>{error}</div>
            ) : <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>{t('common.loading')}</div>}
          </div>

          {/* How-to cards */}
          {[
            { name: 'Google Calendar', icon: '🗓️', link: 'https://support.google.com/calendar/answer/37100',
              steps: [t('calendarSync.gcalStep1'), t('calendarSync.gcalStep2'), t('calendarSync.gcalStep3'), t('calendarSync.gcalStep4')] },
            { name: 'Apple Calendar', icon: '🍎', link: 'https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac',
              steps: [t('calendarSync.appleStep1'), t('calendarSync.appleStep2'), t('calendarSync.appleStep3'), t('calendarSync.appleStep4')] },
            { name: 'Outlook', icon: '📧', link: '#',
              steps: [t('calendarSync.outlookStep1'), t('calendarSync.outlookStep2'), t('calendarSync.outlookStep3')] },
          ].map(app => (
            <div key={app.name} className="card" style={{ marginBottom: 10 }}>
              <div style={{ fontWeight: 700, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                {app.icon} {app.name}
                <a href={app.link} target="_blank" rel="noreferrer" style={{ color: 'var(--ink-soft)', marginLeft: 'auto' }}><ExternalLink size={12} /></a>
              </div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {app.steps.map((s, i) => <li key={i} style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 3 }}>{s}</li>)}
              </ol>
            </div>
          ))}
        </div>

        {/* ── RIGHT: Import from Google Calendar ────────────────────────── */}
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <RefreshCw size={20} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0 }}>{t('calendarSync.autoSyncTitle')}</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0, lineHeight: 1.6 }}>
              {t('calendarSync.autoSyncExplanation')}
            </p>

            {orgs.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                  {t('calendarSync.organization')}
                </label>
                <select value={selOrgId ?? ''} onChange={e => setSelOrgId(Number(e.target.value))} style={{ width: '100%' }}>
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
            )}
            {selOrgId && orgs.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginBottom: 12 }}>
                {t('calendarSync.forOrgCalendar', { org: orgs.find(o => o.id === selOrgId)?.name })}
              </div>
            )}

            {googleStatus?.connectedEmail ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-muted)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                  <CheckCircle2 size={16} style={{ color: 'green' }} />
                  <div style={{ fontSize: 13 }}>
                    {t('calendarSync.connectedAs')} <strong>{googleStatus.connectedEmail}</strong>
                    {googleStatus.lastSyncedAt && (
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                        {t('calendarSync.lastSynced')}: {new Date(googleStatus.lastSyncedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={syncNow} disabled={syncingNow}>
                    <RefreshCw size={14} /> {syncingNow ? t('ordersEmail.syncing') : t('ordersEmail.syncNow')}
                  </button>
                  <button className="ghost" onClick={disconnectGoogle} style={{ color: 'var(--danger)' }}>
                    {t('calendarSync.disconnect')}
                  </button>
                </div>
              </>
            ) : (
              <button onClick={connectGoogle} disabled={connecting}>
                <ExternalLink size={14} /> {connecting ? t('calendarSync.openingGoogle') : t('calendarSync.connectGoogle')}
              </button>
            )}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <Upload size={20} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0 }}>{t('calendarSync.importTitle')}</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0, lineHeight: 1.6 }}>
              {t('calendarSync.importExplanation')}
            </p>

            {/* Step-by-step export guide */}
            <div style={{ background: 'var(--surface-muted)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>{t('calendarSync.howToExport')}</div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {[
                  t('calendarSync.exportStep1'),
                  t('calendarSync.exportStep2'),
                  t('calendarSync.exportStep3'),
                  t('calendarSync.exportStep4'),
                  t('calendarSync.exportStep5'),
                  t('calendarSync.exportStep6'),
                ].map((s, i) => (
                  <li key={i} style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 5 }}>
                    {i === 1 ? <><span dangerouslySetInnerHTML={{__html: s}} /></> : s}
                  </li>
                ))}
              </ol>
            </div>

            {/* Organization selector */}
            {orgs.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                  {t('calendarSync.importIntoOrg')}
                </label>
                <select
                  value={selOrgId ?? ''}
                  onChange={e => setSelOrgId(Number(e.target.value))}
                  style={{ width: '100%' }}
                >
                  {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
                {selOrgId && (
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>
                    {t('calendarSync.eventsAddedTo', { org: orgs.find(o => o.id === selOrgId)?.name })}
                  </div>
                )}
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 10,
                padding: '32px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragOver ? 'var(--primary-pale, rgba(44,62,112,0.06))' : 'transparent',
                transition: 'all 0.15s',
              }}
            >
              {importing ? (
                <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
                  <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                  <div>{t('calendarSync.importingEvents')}</div>
                </div>
              ) : (
                <>
                  <Upload size={32} style={{ color: 'var(--ink-soft)', marginBottom: 8 }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('calendarSync.dropFileHere')}</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('calendarSync.orClickToBrowse')}</div>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept=".ics,text/calendar" style={{ display: 'none' }} onChange={onFileChange} />
          </div>

          {/* Import result */}
          {importResult && (
            <div className="card" style={{ borderLeft: `4px solid ${importResult.errors.length > 0 ? 'var(--warning, orange)' : 'green'}` }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <CheckCircle2 size={20} color="green" />
                <span style={{ fontWeight: 700, fontSize: 15 }}>{t('calendarSync.importComplete')}</span>
              </div>
              <div style={{ display: 'flex', gap: 20, marginBottom: importResult.errors.length > 0 ? 12 : 0 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: 28, color: 'green' }}>{importResult.imported}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{t('calendarSync.imported')}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: 28, color: 'var(--ink-soft)' }}>{importResult.skipped}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{t('calendarSync.skipped')}</div>
                </div>
                {importResult.errors.length > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: 28, color: 'orange' }}>{importResult.errors.length}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>{t('calendarSync.errors')}</div>
                  </div>
                )}
              </div>
              {importResult.errors.length > 0 && (
                <div style={{ background: 'var(--surface-muted)', borderRadius: 6, padding: 10, fontSize: 11 }}>
                  {importResult.errors.slice(0, 5).map((e, i) => <div key={i} style={{ color: 'red', marginBottom: 2 }}>⚠ {e}</div>)}
                  {importResult.errors.length > 5 && <div style={{ color: 'var(--ink-soft)' }}>{t('calendarSync.andMore', { count: importResult.errors.length - 5 })}</div>}
                </div>
              )}
            </div>
          )}

          {/* Note */}
          <div className="card" style={{ marginTop: 14, borderLeft: '3px solid var(--primary)', fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
            <strong>{t('calendarSync.notesLabel')}</strong> {t('calendarSync.notesBody')}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
