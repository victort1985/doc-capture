import { useState } from 'react';
import { KeyRound, AlertCircle } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useLicense } from '../context/LicenseContext';
import logo from '../assets/logo.png';

export default function LicenseActivationPage() {
  const { refresh } = useLicense();
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const cleaned = key.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(cleaned)) {
      setError('A license key is 64 hexadecimal characters.');
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/license/activate', { method: 'POST', body: JSON.stringify({ key: cleaned }) });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed');
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
        <p className="tagline">Enter your license key to activate this installation.</p>

        {error && (
          <div className="error-banner">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <label>License key</label>
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="64 hex characters"
            style={{ fontFamily: 'monospace', letterSpacing: '0.02em' }}
            autoFocus
          />
          <button type="submit" disabled={loading}>
            {loading ? 'Activating…' : <><KeyRound size={16} /> Activate</>}
          </button>
        </form>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 14 }}>
          Don't have a key? Contact your Vixor ERP provider.
        </p>
      </div>
    </div>
  );
}
