import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyRound, AlertCircle } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useLicense } from '../context/LicenseContext';
import logo from '../assets/logo.png';

export default function LicenseActivationPage() {
  const { t } = useTranslation();
  const { refresh } = useLicense();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleaned = key.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(cleaned)) {
      setError(t('license.invalidKeyFormat'));
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/license/activate', { method: 'POST', body: JSON.stringify({ key: cleaned }) });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('license.activationFailed'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <img src={logo} alt="Vixor ERP" className="login-logo" />
        <div className="wordmark">
          <span style={{ fontWeight: 800, letterSpacing: '0.15em' }}>VIXOR</span>
          <span style={{ fontWeight: 300, color: '#F2701C', letterSpacing: '0.1em' }}> ERP</span>
        </div>
        <p className="tagline">{t('license.enterKeyTagline')}</p>

        {error && (
          <div className="error-banner">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <label>{t('license.keyLabel')}</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={t('license.keyPlaceholder')}
            style={{ fontFamily: 'monospace', letterSpacing: '0.02em' }}
            autoFocus
          />
          <button type="submit" disabled={loading}>
            {loading ? t('license.activating') : <><KeyRound size={16} /> {t('license.activate')}</>}
          </button>
        </form>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 14 }}>
          {t('license.noKeyHint')}
        </p>
      </div>
    </div>
  );
}
