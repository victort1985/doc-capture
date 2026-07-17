import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useLicense } from '../context/LicenseContext';

function formatRemaining(ms: number): string {
  if (ms <= 0) return '0h 0m';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export default function LicenseWarningBanner() {
  const { status } = useLicense();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (status?.state !== 'WARNING' || !status.nextDeadline) return null;

  const remaining = new Date(status.nextDeadline).getTime() - now;

  return (
    <div style={{
      background: '#fff3e0', color: '#8a4b0a', padding: '8px 16px',
      display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600,
      borderBottom: '1px solid #f0c896',
    }}>
      <TriangleAlert size={15} />
      License check overdue — the admin panel will lock in {formatRemaining(remaining)} unless a check succeeds.
    </div>
  );
}
