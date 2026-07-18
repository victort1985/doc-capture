import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useLicense } from '../context/LicenseContext';

export default function LicenseLockedPage() {
  const { t } = useTranslation();
  const { status, refresh } = useLicense();
  const isFull = status?.state === 'FULL_LOCKED';

  return (
    <div className="login-screen">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: 'var(--danger, crimson)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px',
        }}>
          <Lock size={28} color="#fff" />
        </div>
        <h2 style={{ margin: '0 0 8px' }}>
          {isFull ? t('license.lockedFullTitle') : t('license.lockedAdminTitle')}
        </h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, maxWidth: 320, margin: '0 auto 4px' }}>
          {isFull ? t('license.lockedFullBody') : t('license.lockedAdminBody')}
        </p>
        {status?.lastVerifiedAt && (
          <p style={{ color: 'var(--ink-soft)', fontSize: 12, marginTop: 12 }}>
            {t('license.lastVerified')}: {new Date(status.lastVerifiedAt).toLocaleString()}
          </p>
        )}
        <button onClick={refresh} style={{ marginTop: 16 }}>{t('license.checkAgain')}</button>
      </div>
    </div>
  );
}

