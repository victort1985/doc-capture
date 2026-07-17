import { Lock } from 'lucide-react';
import { useLicense } from '../context/LicenseContext';

export default function LicenseLockedPage() {
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
          {isFull ? 'This installation is locked' : 'Admin panel locked'}
        </h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 14, maxWidth: 320, margin: '0 auto 4px' }}>
          {isFull
            ? 'The license for this installation has not been verified. Contact your Vixor ERP provider to reactivate.'
            : 'The license check is overdue. The admin panel is locked, but the mobile app keeps working for now.'}
        </p>
        {status?.lastVerifiedAt && (
          <p style={{ color: 'var(--ink-soft)', fontSize: 12, marginTop: 12 }}>
            Last verified: {new Date(status.lastVerifiedAt).toLocaleString()}
          </p>
        )}
        <button onClick={refresh} style={{ marginTop: 16 }}>Check again</button>
      </div>
    </div>
  );
}
