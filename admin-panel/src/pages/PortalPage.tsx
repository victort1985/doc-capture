import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BASE_URL } from '../services/api';

interface PortalCall {
  id: number;
  status: 'open' | 'in_progress' | 'closed';
  urgency: 'urgent' | 'not_urgent';
  createdAt: string;
  statusChangedAt: string | null;
}
interface PortalData {
  locationName: string;
  calls: PortalCall[];
}

const statusLabel: Record<string, string> = { open: 'Open', in_progress: 'In progress', closed: 'Closed' };
const statusColor: Record<string, string> = { open: '#c95c11', in_progress: '#1D3557', closed: '#1a7a3c' };

export default function PortalPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE_URL}/portal/${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('This portal link is invalid or has been revoked.');
        return res.json();
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={{ minHeight: '100vh', background: '#f5f6fa', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '48px 20px' }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, letterSpacing: '0.1em', color: '#c95c11', fontWeight: 700 }}>VIXOR ERP</div>
          <h1 style={{ margin: '4px 0 0', fontSize: 26 }}>{data ? data.locationName : 'Client portal'}</h1>
        </div>

        {loading && <p style={{ color: '#5c665f' }}>Loading…</p>}
        {error && <div style={{ background: '#fdeceb', color: '#b3261e', padding: '12px 16px', borderRadius: 8 }}>{error}</div>}

        {data && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {data.calls.length === 0 && <p style={{ color: '#5c665f' }}>No service calls yet.</p>}
            {data.calls.map((c) => (
              <div key={c.id} style={{ background: '#fff', border: '1px solid #e2e5ee', borderRadius: 10, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>Service call #{c.id}</div>
                  <div style={{ fontSize: 13, color: '#5c665f' }}>
                    Opened {new Date(c.createdAt).toLocaleDateString()}
                    {c.urgency === 'urgent' && <span style={{ color: '#b3261e' }}> · Urgent</span>}
                  </div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', background: statusColor[c.status], padding: '4px 10px', borderRadius: 20 }}>
                  {statusLabel[c.status]}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
