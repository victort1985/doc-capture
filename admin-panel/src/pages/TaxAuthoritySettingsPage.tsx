import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiFetch } from '../services/api';

interface TaxAuthoritySettings {
  enabled: boolean;
  environment: 'sandbox' | 'production';
  vatNumber?: string;
  softwareRegistrationNumber?: string;
  thresholdAmount: number;
  clientId?: string;
  oauthScope?: string;
  connected: boolean;
  lastConnectedAt?: string;
}

export default function TaxAuthoritySettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<TaxAuthoritySettings | null>(null);
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<TaxAuthoritySettings>('/tax-authority/settings').then(setSettings).catch((e) => setError(e.message));
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected')) setNotice(t('taxAuthority.connectedSuccess'));
    if (params.get('error')) setError(decodeURIComponent(params.get('error') ?? ''));
  }, []);

  async function save(patch: Partial<TaxAuthoritySettings> & { clientSecret?: string }) {
    if (!settings) return;
    setSaving(true); setError(null);
    try {
      await apiFetch('/tax-authority/settings', { method: 'POST', body: JSON.stringify(patch) });
      setSettings({ ...settings, ...patch });
      setClientSecret('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  async function connect() {
    setError(null);
    try {
      const redirectUri = `${window.location.origin}/api/tax-authority/callback`;
      const { url } = await apiFetch<{ url: string }>(`/tax-authority/connect?redirectUri=${encodeURIComponent(redirectUri)}`);
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start connection');
    }
  }

  if (!settings) return <div className="page"><p>{t('common.loading')}</p></div>;

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('taxAuthority.eyebrow')}</div><h1>{t('taxAuthority.title')}</h1></div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, fontSize: 13 }}>
        {t('taxAuthority.disclaimer')}
      </div>

      {notice && <div style={{ background: '#e6f4ea', color: '#1a7f37', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>{notice}</div>}
      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input type="checkbox" checked={settings.enabled} onChange={(e) => save({ enabled: e.target.checked })} style={{ width: 'auto' }} />
          {t('taxAuthority.enable')}
        </label>

        <label>{t('taxAuthority.environment')}</label>
        <select value={settings.environment} onChange={(e) => save({ environment: e.target.value as 'sandbox' | 'production' })} style={{ width: '100%', marginBottom: 12 }}>
          <option value="sandbox">{t('taxAuthority.sandbox')}</option>
          <option value="production">{t('taxAuthority.production')}</option>
        </select>

        <label>{t('taxAuthority.vatNumber')}</label>
        <input value={settings.vatNumber ?? ''} onChange={(e) => setSettings({ ...settings, vatNumber: e.target.value })} onBlur={() => save({ vatNumber: settings.vatNumber })} style={{ width: '100%', marginBottom: 12 }} />

        <label>{t('taxAuthority.softwareRegistrationNumber')}</label>
        <input
          value={settings.softwareRegistrationNumber ?? ''}
          onChange={(e) => setSettings({ ...settings, softwareRegistrationNumber: e.target.value })}
          onBlur={() => save({ softwareRegistrationNumber: settings.softwareRegistrationNumber })}
          placeholder={t('taxAuthority.softwareRegistrationHint')}
          style={{ width: '100%', marginBottom: 12 }}
        />

        <label>{t('taxAuthority.thresholdAmount')}</label>
        <input
          type="number"
          value={settings.thresholdAmount}
          onChange={(e) => setSettings({ ...settings, thresholdAmount: Number(e.target.value) })}
          onBlur={() => save({ thresholdAmount: settings.thresholdAmount })}
          style={{ width: '100%', marginBottom: 4 }}
        />
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 12px' }}>{t('taxAuthority.thresholdHint')}</p>

        <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid var(--border, #e5e5e5)' }} />

        <label>{t('taxAuthority.clientId')}</label>
        <input value={settings.clientId ?? ''} onChange={(e) => setSettings({ ...settings, clientId: e.target.value })} onBlur={() => save({ clientId: settings.clientId })} style={{ width: '100%', marginBottom: 12 }} />

        <label>{t('taxAuthority.clientSecret')}</label>
        <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder={t('taxAuthority.clientSecretHint')} style={{ width: '100%', marginBottom: 12 }} />
        {clientSecret && (
          <button type="button" className="ghost" onClick={() => save({ clientSecret })} style={{ marginBottom: 12 }}>{t('common.save')}</button>
        )}

        <label>{t('taxAuthority.oauthScope')}</label>
        <input value={settings.oauthScope ?? ''} onChange={(e) => setSettings({ ...settings, oauthScope: e.target.value })} onBlur={() => save({ oauthScope: settings.oauthScope })} style={{ width: '100%', marginBottom: 4 }} />
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 16px' }}>{t('taxAuthority.oauthScopeHint')}</p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={connect} disabled={saving || !settings.clientId || !settings.oauthScope}>
            <ExternalLink size={15} /> {settings.connected ? t('taxAuthority.reconnect') : t('taxAuthority.connect')}
          </button>
          {settings.connected ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--success, green)', fontSize: 13 }}>
              <CheckCircle2 size={15} /> {t('taxAuthority.connected')}
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ink-soft)', fontSize: 13 }}>
              <AlertCircle size={15} /> {t('taxAuthority.notConnected')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
