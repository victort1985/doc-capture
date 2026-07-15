import { useEffect, useState } from 'react';
import { Save, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../services/api';

interface EmailSettings {
  enabled: boolean;
  emailAddress?: string;
  imapHost: string;
  imapPort: number;
  lastCheckedAt?: string | null;
  lastError?: string | null;
}

const EMPTY: EmailSettings = { enabled: false, emailAddress: '', imapHost: 'imap.gmail.com', imapPort: 993 };

export default function OrdersEmailSettingsPage() {
  const [settings, setSettings] = useState<EmailSettings>(EMPTY);
  const [appPassword, setAppPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<EmailSettings>('/orders/email-settings')
      .then(setSettings)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const updated = await apiFetch<EmailSettings>('/orders/email-settings', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: settings.enabled,
          emailAddress: settings.emailAddress,
          imapHost: settings.imapHost,
          imapPort: settings.imapPort,
          ...(appPassword.trim() ? { appPassword: appPassword.trim() } : {}),
        }),
      });
      setSettings(updated);
      setAppPassword('');
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="page"><p>Loading…</p></div>;

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">ORDERS</div>
          <h1>Order intake email</h1>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', maxWidth: 640 }}>
        Connect the dedicated Gmail inbox that receives supplier purchase orders. The app checks
        it every 5 minutes for new emails with a PDF attachment, extracts the order date,
        ordering organization, and PO number from the document, and adds it to the Orders list
        automatically. This uses a Gmail <strong>app password</strong>, not the account's real
        login password — generate one at{' '}
        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
          myaccount.google.com/apppasswords
        </a>{' '}
        (2-Step Verification must be turned on for that Google account first).
      </p>

      <div className="card form-card" style={{ maxWidth: 560 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          />
          Enabled
        </label>

        <label>Gmail address</label>
        <input
          type="email"
          value={settings.emailAddress ?? ''}
          onChange={(e) => setSettings({ ...settings, emailAddress: e.target.value })}
          placeholder="orders@yourcompany.com"
        />

        <label>App password</label>
        <input
          type="password"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          placeholder={settings.emailAddress ? 'Leave blank to keep the current one' : 'xxxx xxxx xxxx xxxx'}
        />

        <div className="form-grid">
          <div>
            <label>IMAP host</label>
            <input
              value={settings.imapHost}
              onChange={(e) => setSettings({ ...settings, imapHost: e.target.value })}
            />
          </div>
          <div>
            <label>IMAP port</label>
            <input
              type="number"
              value={settings.imapPort}
              onChange={(e) => setSettings({ ...settings, imapPort: parseInt(e.target.value, 10) || 993 })}
            />
          </div>
        </div>

        {settings.lastCheckedAt && (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            Last checked: {new Date(settings.lastCheckedAt).toLocaleString()}
          </p>
        )}
        {settings.lastError && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--danger)', fontSize: 13 }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Last check failed: {settings.lastError}</span>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}
        {saved && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--success, green)', fontSize: 13 }}>
            <CheckCircle2 size={16} /> Saved
          </div>
        )}

        <div className="form-actions">
          <button type="button" disabled={saving} onClick={save}>
            <Save size={15} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
