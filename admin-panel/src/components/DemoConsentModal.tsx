import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const SESSION_KEY = 'vixor-demo-notice-shown';

export default function DemoConsentModal() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user?.isDemoMode && !sessionStorage.getItem(SESSION_KEY)) {
      setOpen(true);
    }
  }, [user?.isDemoMode]);

  if (!open) return null;

  function dismiss() {
    sessionStorage.setItem(SESSION_KEY, '1');
    setOpen(false);
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,22,66,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto' }}>
        <h2 style={{ marginTop: 0 }}>{t('demoNotice.title')}</h2>
        <p style={{ fontSize: 14, color: 'var(--ink)' }}>{t('demoNotice.intro')}</p>

        <div style={{ background: 'var(--surface-muted)', borderRadius: 8, padding: 14, margin: '14px 0' }}>
          <strong style={{ fontSize: 13 }}>{t('demoNotice.disabledTitle')}</strong>
          <ul style={{ fontSize: 13.5, marginTop: 8, paddingInlineStart: 20 }}>
            <li>{t('demoNotice.disabled1')}</li>
            <li>{t('demoNotice.disabled2')}</li>
            <li>{t('demoNotice.disabled3')}</li>
          </ul>
        </div>

        <p style={{ fontSize: 13.5, color: 'var(--danger, #b3261e)', fontWeight: 600 }}>{t('demoNotice.deletionWarning')}</p>

        <div className="form-actions" style={{ marginTop: 18 }}>
          <button type="button" onClick={dismiss} style={{ width: '100%' }}>{t('demoNotice.agree')}</button>
        </div>
      </div>
    </div>
  );
}
