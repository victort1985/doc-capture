import { useEffect, useRef, useState } from 'react';
import { Calendar, RefreshCw, Copy, Check, ExternalLink, Upload, AlertCircle, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../services/api';

interface IcsData { token: string | null; url: string | null; }
interface ImportResult { imported: number; skipped: number; errors: string[]; }
interface Org { id: number; name: string; }

export default function CalendarSyncPage() {
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

  useEffect(() => {
    if (selOrgId != null) loadGoogleStatus();
  }, [selOrgId]);

  async function loadGoogleStatus() {
    try {
      const s = await apiFetch<{ connectedEmail: string | null; lastSyncedAt: string | null }>(`/calendar/google/status?organizationId=${selOrgId}`);
      setGoogleStatus({ connectedEmail: s.connectedEmail ?? undefined, lastSyncedAt: s.lastSyncedAt ?? undefined });
    } catch (e) { /* non-fatal — leave card in "not connected" state */ }
  }

  async function connectGoogle() {
    if (!selOrgId) { setError('Please select an organization first.'); return; }
    setConnecting(true);
    try {
      const { url } = await apiFetch<{ url: string | null }>(`/calendar/google/auth-url?organizationId=${selOrgId}`);
      if (url) window.location.href = url;
      else setError('No organization selected for this account.');
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
      const d = await apiFetch<IcsData>('/calendar/ics-token');
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
    if (!confirm('This will invalidate all existing calendar subscriptions. Continue?')) return;
    setRotating(true);
    try {
      const d = await apiFetch<IcsData>('/calendar/ics-token/rotate', { method: 'POST' });
      setData(d);
    } finally { setRotating(false); }
  }

  async function importFile(file: File) {
    if (!file.name.endsWith('.ics')) {
      setError('Please select an .ics file exported from Google Calendar.');
      return;
    }
    if (!selOrgId) {
      setError('Please select an organization first.');
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
        <div><span className="eyebrow">Calendar</span><h1 className="page-title">Calendar sync</h1></div>
      </div>

      {error && <div className="error-banner"><AlertCircle size={15} /> {error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── LEFT: Export (subscribe) ──────────────────────────────────── */}
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <Calendar size={20} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0 }}>Subscribe to Vixor calendar</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
              Add this URL in Google Calendar / Apple Calendar / Outlook.
              Events update automatically. Read-only from external apps.
            </p>

            {data?.url ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input readOnly value={fullUrl()} style={{ flex: 1, fontFamily: 'monospace', fontSize: 11, background: 'var(--surface-muted)' }} onClick={e => (e.target as HTMLInputElement).select()} />
                  <button onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy'}</button>
                </div>
                <button className="ghost" onClick={rotate} disabled={rotating} style={{ fontSize: 12, color: 'var(--danger)' }}>
                  <RefreshCw size={12} /> {rotating ? 'Rotating…' : 'Rotate token'}
                </button>
              </>
            ) : <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Loading…</div>}
          </div>

          {/* How-to cards */}
          {[
            { name: 'Google Calendar', icon: '🗓️', link: 'https://support.google.com/calendar/answer/37100',
              steps: ['Open Google Calendar on desktop', 'Click "+" next to "Other calendars"', 'Choose "From URL"', 'Paste the URL above → Add calendar'] },
            { name: 'Apple Calendar', icon: '🍎', link: 'https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac',
              steps: ['File → New Calendar Subscription…', 'Paste the URL above', 'Set auto-refresh to "Every hour"', 'Click OK'] },
            { name: 'Outlook', icon: '📧', link: '#',
              steps: ['Calendar → Add calendar → Subscribe from web', 'Paste the URL above', 'Click Import'] },
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
              <h3 style={{ margin: 0 }}>Auto-sync from Google Calendar</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0, lineHeight: 1.6 }}>
              Connect a Google account once — new and changed events on that
              calendar are pulled into Vixor automatically every ~10 minutes,
              no manual export needed. One-way: Google → Vixor.
            </p>

            {orgs.length > 1 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                  Organization
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
                For <strong>{orgs.find(o => o.id === selOrgId)?.name}</strong>'s calendar
              </div>
            )}

            {googleStatus?.connectedEmail ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-muted)', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                  <CheckCircle2 size={16} style={{ color: 'green' }} />
                  <div style={{ fontSize: 13 }}>
                    Connected as <strong>{googleStatus.connectedEmail}</strong>
                    {googleStatus.lastSyncedAt && (
                      <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                        Last synced: {new Date(googleStatus.lastSyncedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={syncNow} disabled={syncingNow}>
                    <RefreshCw size={14} /> {syncingNow ? 'Syncing…' : 'Sync now'}
                  </button>
                  <button className="ghost" onClick={disconnectGoogle} style={{ color: 'var(--danger)' }}>
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <button onClick={connectGoogle} disabled={connecting}>
                <ExternalLink size={14} /> {connecting ? 'Opening Google…' : 'Connect Google Calendar'}
              </button>
            )}
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
              <Upload size={20} style={{ color: 'var(--primary)' }} />
              <h3 style={{ margin: 0 }}>Import from Google Calendar</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0, lineHeight: 1.6 }}>
              Export your Google Calendar as an <strong>.ics file</strong> and upload it here.
              All events will be imported into Vixor. Duplicates are automatically skipped.
            </p>

            {/* Step-by-step export guide */}
            <div style={{ background: 'var(--surface-muted)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>How to export from Google Calendar:</div>
              <ol style={{ margin: 0, paddingLeft: 18 }}>
                {[
                  'Open Google Calendar on desktop (calendar.google.com)',
                  'Click the ⚙️ gear icon → Settings',
                  'In the left sidebar click "Import & Export"',
                  'Click "Export" — downloads a .zip file',
                  'Extract the .zip — find the .ics file for the calendar you want',
                  'Upload the .ics file below ↓',
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
                  Import into organization
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
                    Events will be added to <strong>{orgs.find(o => o.id === selOrgId)?.name}</strong>'s calendar
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
                  <div>Importing events…</div>
                </div>
              ) : (
                <>
                  <Upload size={32} style={{ color: 'var(--ink-soft)', marginBottom: 8 }} />
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Drop .ics file here</div>
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>or click to browse</div>
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
                <span style={{ fontWeight: 700, fontSize: 15 }}>Import complete</span>
              </div>
              <div style={{ display: 'flex', gap: 20, marginBottom: importResult.errors.length > 0 ? 12 : 0 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: 28, color: 'green' }}>{importResult.imported}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Imported</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 800, fontSize: 28, color: 'var(--ink-soft)' }}>{importResult.skipped}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Skipped</div>
                </div>
                {importResult.errors.length > 0 && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: 28, color: 'orange' }}>{importResult.errors.length}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>Errors</div>
                  </div>
                )}
              </div>
              {importResult.errors.length > 0 && (
                <div style={{ background: 'var(--surface-muted)', borderRadius: 6, padding: 10, fontSize: 11 }}>
                  {importResult.errors.slice(0, 5).map((e, i) => <div key={i} style={{ color: 'red', marginBottom: 2 }}>⚠ {e}</div>)}
                  {importResult.errors.length > 5 && <div style={{ color: 'var(--ink-soft)' }}>…and {importResult.errors.length - 5} more</div>}
                </div>
              )}
            </div>
          )}

          {/* Note */}
          <div className="card" style={{ marginTop: 14, borderLeft: '3px solid var(--primary)', fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
            <strong>Notes:</strong> Events already in Vixor (same UID) are automatically skipped to avoid duplicates.
            You can re-import the same file safely. Recurring events are imported as individual occurrences.
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
