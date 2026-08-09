import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { apiFetch } from '../services/api';

interface Settings { provider: 'none' | 'stripe' | 'tranzila' | 'cardcom'; }

export default function CardAcquiringSettingsPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings>({ provider: 'none' });
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      setSettings(await apiFetch<Settings>('/card-acquiring/settings'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setError(null); setNotice(null);
    try {
      await apiFetch('/card-acquiring/settings', { method: 'POST', body: JSON.stringify({ provider: settings.provider, apiKey: apiKey || undefined }) });
      setNotice(t('cardAcquiring.saved'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">{t('cardAcquiring.eyebrow')}</div>
          <h1>{t('cardAcquiring.title')}</h1>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-start', background: 'var(--surface-muted, #fff8e6)', border: '1px solid var(--stamp-wash, #f2d98a)' }}>
        <AlertTriangle size={20} style={{ color: 'var(--stamp, #F2701C)', flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{t('cardAcquiring.notConnectedTitle')}</div>
          <div style={{ fontSize: 13.5, color: 'var(--ink-soft)' }}>{t('cardAcquiring.notConnectedExplainer')}</div>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="notice-banner" style={{ marginBottom: 12 }}>{notice}</div>}

      <div className="card" style={{ padding: 16, maxWidth: 480, opacity: loading ? 0.6 : 1 }}>
        <label>{t('cardAcquiring.provider')}</label>
        <select value={settings.provider} onChange={(e) => setSettings({ provider: e.target.value as Settings['provider'] })} style={{ width: '100%', marginBottom: 12 }}>
          <option value="none">{t('cardAcquiring.providerNone')}</option>
          <option value="stripe">Stripe</option>
          <option value="tranzila">Tranzila</option>
          <option value="cardcom">CardCom</option>
        </select>

        <label>{t('cardAcquiring.apiKey')}</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={settings.provider === 'none'}
          placeholder={t('cardAcquiring.apiKeyPlaceholder')}
          style={{ width: '100%', marginBottom: 6 }}
        />
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 0, marginBottom: 14 }}>{t('cardAcquiring.apiKeyHint')}</p>

        <button type="button" onClick={save} disabled={saving || loading} style={{ width: '100%' }}>
          {saving ? t('common.saving') : t('cardAcquiring.saveSettings')}
        </button>
      </div>
    </div>
  );
}
