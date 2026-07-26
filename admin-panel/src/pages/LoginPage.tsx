import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LogIn, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/api';
import CopyrightFooter from '../components/CopyrightFooter';
import logo from '../assets/logo.png';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(username, password, needsTotp ? totpCode : undefined);
      navigate('/');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code === 'TOTP_REQUIRED') {
        setNeedsTotp(true);
        setError(null);
      } else if (code === 'TOTP_INVALID') {
        setError(t('login.totpInvalid'));
      } else {
        setError(err instanceof Error ? err.message : t('login.error'));
      }
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
        <p className="tagline">{t('login.wordmarkTagline')}</p>

        {error && (
          <div className="error-banner">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label>{t('login.username')}</label>
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus disabled={needsTotp} />
          <label>{t('login.password')}</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={needsTotp}
          />
          {needsTotp && (
            <>
              <label>{t('login.totpCode')}</label>
              <input
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
                inputMode="numeric"
                maxLength={6}
                autoFocus
                placeholder="000000"
              />
            </>
          )}
          <button type="submit" disabled={loading}>
            {loading ? t('login.signingIn') : <><LogIn size={16} /> {t('login.signIn')}</>}
          </button>
        </form>
      </div>
      <CopyrightFooter />
    </div>
  );
}
