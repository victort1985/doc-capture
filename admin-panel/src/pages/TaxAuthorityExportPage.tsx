import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDown, AlertTriangle } from 'lucide-react';
import { apiFetchBlobPost } from '../services/api';
import { useAuth } from '../context/AuthContext';

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TaxAuthorityExportPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  // A genuine super-admin picks which org to act as via the global
  // switcher in the header (OrgSwitcher.tsx) — that choice applies
  // here automatically via the X-Active-Org header every apiFetch*
  // call already sends (see JwtStrategy.validate()'s own doc comment
  // for the backend half), no separate picker needed on this page
  // anymore.
  const isSuperAdmin = (user?.realOrganizationId ?? user?.organizationId) == null;
  const isActingAsOrg = user?.isActingAsOrg ?? false;

  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function generate() {
    setGenerating(true); setError(null); setNotice(null);
    try {
      const url = await apiFetchBlobPost('/tax-authority-export', { from, to });
      const a = document.createElement('a');
      a.href = url;
      a.download = `openformat-${from}-to-${to}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setNotice(t('taxAuthorityExport.downloadStarted'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate export');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('taxAuthorityExport.eyebrow')}</div><h1>{t('taxAuthorityExport.title')}</h1></div>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        {t('taxAuthorityExport.disclaimer')}
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <AlertTriangle size={18} color="#F2701C" style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ margin: 0, fontSize: 13 }}>{t('taxAuthorityExport.simulatorNote')}</p>
      </div>

      {isSuperAdmin && !isActingAsOrg && (
        <div className="card" style={{ padding: 16, marginBottom: 16, background: 'var(--surface-muted)' }}>
          <p style={{ margin: 0, fontSize: 13 }}>{t('taxAuthorityExport.useOrgSwitcher')}</p>
        </div>
      )}

      <div className="card" style={{ padding: 20, maxWidth: 480 }}>
        <label>{t('taxAuthorityExport.fromDate')}</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: '100%', marginBottom: 14 }} />

        <label>{t('taxAuthorityExport.toDate')}</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: '100%', marginBottom: 20 }} />

        {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}
        {notice && <div style={{ background: '#e6f4ea', color: '#1a7f37', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{notice}</div>}

        <button type="button" onClick={generate} disabled={generating || (isSuperAdmin && !isActingAsOrg)} style={{ width: '100%' }}>
          <FileDown size={15} /> {generating ? t('taxAuthorityExport.generating') : t('taxAuthorityExport.generate')}
        </button>
      </div>
    </div>
  );
}
