import { useEffect, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Save, Mail, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { apiFetch } from '../services/api';

interface EmailSettings {
  enabled: boolean;
  emailAddress?: string;
  imapHost: string;
  imapPort: number;
  lastCheckedAt?: string | null;
  lastError?: string | null;
  notifyOnCompleteEnabled?: boolean;
  notifyEmails?: string | null;
}

const EMPTY: EmailSettings = {
  enabled: false,
  emailAddress: '',
  imapHost: 'imap.gmail.com',
  imapPort: 993,
  notifyOnCompleteEnabled: false,
  notifyEmails: '',
};

export default function OrdersEmailSettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<EmailSettings>(EMPTY);
  const [appPassword, setAppPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
          notifyOnCompleteEnabled: settings.notifyOnCompleteEnabled ?? false,
          notifyEmails: settings.notifyEmails ?? '',
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

  async function syncNow() {
    setSyncing(true);
    setError(null);
    try {
      const updated = await apiFetch<EmailSettings>('/orders/email-settings/sync-now', { method: 'POST' });
      setSettings(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <div className="page"><p>{t('common.loading')}</p></div>;

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">{t('orders.eyebrow')}</div>
          <h1>{t('ordersEmail.title')}</h1>
        </div>
      </div>

      <p style={{ color: 'var(--ink-soft)', maxWidth: 640 }}>
        <Trans i18nKey="ordersEmail.explanation" components={{
          strong: <strong />,
          a: <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" />,
        }} />
      </p>

      <div className="card form-card" style={{ maxWidth: 560 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })}
          />
          {t('ordersEmail.enabled')}
        </label>

        <label>{t('ordersEmail.gmailAddress')}</label>
        <input
          type="email"
          value={settings.emailAddress ?? ''}
          onChange={(e) => setSettings({ ...settings, emailAddress: e.target.value })}
          placeholder="orders@yourcompany.com"
        />

        <label>{t('ordersEmail.appPassword')}</label>
        <input
          type="password"
          value={appPassword}
          onChange={(e) => setAppPassword(e.target.value)}
          placeholder={settings.emailAddress ? t('ordersEmail.appPasswordKeepPlaceholder') : 'xxxx xxxx xxxx xxxx'}
        />

        <div className="form-grid">
          <div>
            <label>{t('ordersEmail.imapHost')}</label>
            <input
              value={settings.imapHost}
              onChange={(e) => setSettings({ ...settings, imapHost: e.target.value })}
            />
          </div>
          <div>
            <label>{t('ordersEmail.imapPort')}</label>
            <input
              type="number"
              value={settings.imapPort}
              onChange={(e) => setSettings({ ...settings, imapPort: parseInt(e.target.value, 10) || 993 })}
            />
          </div>
        </div>

        <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--border, #e5e5e5)' }} />

        <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            type="checkbox"
            checked={!!settings.notifyOnCompleteEnabled}
            onChange={(e) => setSettings({ ...settings, notifyOnCompleteEnabled: e.target.checked })}
          />
          {t('ordersEmail.notifyOnComplete')}
        </label>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, maxWidth: 560 }}>
          {t('ordersEmail.notifyExplanation')}
        </p>

        <label>{t('ordersEmail.recipientEmails')}</label>
        <input
          value={settings.notifyEmails ?? ''}
          onChange={(e) => setSettings({ ...settings, notifyEmails: e.target.value })}
          placeholder="accounting@yourcompany.com, manager@yourcompany.com"
        />

        {settings.lastCheckedAt && (
          <p style={{ fontSize: 13, color: 'var(--ink-soft)' }}>
            {t('ordersEmail.lastChecked')}: {new Date(settings.lastCheckedAt).toLocaleString()}
          </p>
        )}
        {settings.lastError && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: 'var(--danger)', fontSize: 13 }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>{t('ordersEmail.lastCheckFailed')}: {settings.lastError}</span>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}
        {saved && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: 'var(--success, green)', fontSize: 13 }}>
            <CheckCircle2 size={16} /> {t('common.saved')}
          </div>
        )}

        <div className="form-actions">
          <button type="button" disabled={saving} onClick={save}>
            <Save size={15} /> {saving ? t('common.saving') : t('common.save')}
          </button>
          <button type="button" disabled={syncing || !settings.enabled} onClick={syncNow} title={!settings.enabled ? t('ordersEmail.enableFirstHint') : undefined}>
            <RefreshCw size={15} /> {syncing ? t('ordersEmail.syncing') : t('ordersEmail.syncNow')}
          </button>
        </div>
      </div>
    </div>
  );
}
