import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../services/api';
import TermsOfServiceContent from './TermsOfServiceContent';

export default function TermsOfServiceGate() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  if (!user || user.tosAccepted) return null;

  async function accept() {
    setSaving(true); setError(null);
    try {
      await apiFetch('/auth/accept-tos', { method: 'POST' });
      await refreshUser();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,22,66,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 700, padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>{t('tos.gateTitle')}</h2>
        <p style={{ fontSize: 13.5, color: 'var(--ink-soft)', marginBottom: 14 }}>{t('tos.gateIntro')}</p>

        <div style={{ overflowY: 'auto', border: '1px solid var(--border, #e5e5e5)', borderRadius: 8, padding: '14px 18px', flex: 1, marginBottom: 14 }}>
          <TermsOfServiceContent />
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}

        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13.5, marginBottom: 14 }}>
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} style={{ marginTop: 2 }} />
          {t('tos.checkboxLabel')}
        </label>

        <button type="button" disabled={!checked || saving} onClick={accept} style={{ width: '100%' }}>
          {saving ? t('common.saving') : t('tos.accept')}
        </button>
      </div>
    </div>
  );
}
