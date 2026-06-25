import { useEffect, useState } from 'react';
import { Calendar, RefreshCw, Copy, Check, ExternalLink } from 'lucide-react';
import { apiFetch } from '../services/api';

interface IcsData { token: string | null; url: string | null; }
interface Org { id: number; name: string; }

const GOOGLE_HELP = 'https://support.google.com/calendar/answer/37100';
const APPLE_HELP  = 'https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac';

export default function CalendarSyncPage() {
  const [data, setData] = useState<IcsData | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selOrg, setSelOrg] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = window.location.origin;

  useEffect(() => {
    apiFetch<Org[]>('/organizations').then(os => {
      setOrgs(os);
      if (os.length) setSelOrg(os[0].id);
    }).catch(() => {});
    load();
  }, []);

  useEffect(() => { if (selOrg) load(); }, [selOrg]);

  async function load() {
    try {
      setError(null);
      const d = await apiFetch<IcsData>('/calendar/ics-token');
      setData(d);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error'); }
  }

  function fullUrl() {
    if (!data?.url) return '';
    return `${baseUrl}${data.url}`;
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

  return (
    <div>
      <div className="topbar">
        <div>
          <span className="eyebrow">Calendar</span>
          <h1 className="page-title">Calendar sync</h1>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {/* Explanation */}
      <div className="card" style={{ marginBottom: 16, background: 'var(--surface-muted)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Calendar size={24} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>ICS Calendar feed</div>
            <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.6 }}>
              Subscribe to the Vixor ERP calendar from any calendar app — Google Calendar, Apple Calendar, Outlook.
              The secret URL is unique per organization and refreshes automatically every few minutes.
              No Google API key required.
            </div>
          </div>
        </div>
      </div>

      {/* URL card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 12px' }}>Your calendar subscription URL</h3>

        {data?.url ? (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input
                readOnly
                value={fullUrl()}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: 12, background: 'var(--surface-muted)' }}
                onClick={e => (e.target as HTMLInputElement).select()}
              />
              <button onClick={copy} title="Copy URL">
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                onClick={rotate}
                disabled={rotating}
                className="ghost"
                style={{ fontSize: 12, color: 'var(--danger)' }}
              >
                <RefreshCw size={13} /> {rotating ? 'Rotating…' : 'Rotate token (invalidates existing)'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>Loading…</div>
        )}
      </div>

      {/* How to subscribe */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {[
          {
            name: 'Google Calendar',
            icon: '🗓️',
            steps: [
              'Open Google Calendar on desktop',
              'Click "+" next to "Other calendars"',
              'Choose "From URL"',
              'Paste the URL above',
              'Click "Add calendar"',
            ],
            link: GOOGLE_HELP,
          },
          {
            name: 'Apple Calendar',
            icon: '🍎',
            steps: [
              'Open Calendar on Mac or iPhone',
              'File → New Calendar Subscription…',
              'Paste the URL above',
              'Set auto-refresh to "Every hour"',
              'Click OK',
            ],
            link: APPLE_HELP,
          },
          {
            name: 'Outlook',
            icon: '📧',
            steps: [
              'Open Outlook Calendar',
              'Add calendar → Subscribe from web',
              'Paste the URL above',
              'Click Import',
              'Events sync every few hours',
            ],
            link: 'https://support.microsoft.com/office/import-or-subscribe-to-a-calendar-cff1429c-5af6-41ec-a5b4-74f2c278e98c',
          },
        ].map(app => (
          <div key={app.name} className="card">
            <div style={{ fontSize: 24, marginBottom: 6 }}>{app.icon}</div>
            <div style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
              {app.name}
              <a href={app.link} target="_blank" rel="noreferrer" style={{ color: 'var(--ink-soft)' }}>
                <ExternalLink size={12} />
              </a>
            </div>
            <ol style={{ paddingLeft: 16, margin: 0 }}>
              {app.steps.map((s, i) => (
                <li key={i} style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 5 }}>{s}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      {/* Mobile app note */}
      <div className="card" style={{ marginTop: 16, borderLeft: '3px solid var(--primary)' }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>📱 Mobile app</div>
        <div style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
          The Vixor ERP mobile app has a built-in calendar that shows and creates events directly.
          ICS sync is for viewing Vixor events in external calendar apps (Google Calendar, Apple Calendar, Outlook).
          The ICS feed is read-only — changes must be made in the Vixor app.
        </div>
      </div>
    </div>
  );
}
