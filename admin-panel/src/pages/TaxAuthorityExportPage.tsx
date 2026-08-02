import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDown, AlertTriangle } from 'lucide-react';
import { apiFetch, apiFetchBlobPost } from '../services/api';
import { useAuth } from '../context/AuthContext';

interface Org {
  id: number;
  name: string;
}

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function TaxAuthorityExportPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSuperAdmin = user?.organizationId == null;

  const [orgs, setOrgs] = useState<Org[]>([]);
  const [organizationId, setOrganizationId] = useState<number | ''>('');
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(today());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Only a genuine super-admin manages more than one organization —
  // an org-scoped admin's own org is applied automatically server-
  // side (see the controller's own doc comment), so this list is
  // only fetched/shown when it's actually needed.
  useEffect(() => {
    if (!isSuperAdmin) return;
    apiFetch<Org[]>('/organizations').then(setOrgs).catch(() => setOrgs([]));
  }, [isSuperAdmin]);

  async function generate() {
    if (isSuperAdmin && organizationId === '') {
      setError(t('taxAuthorityExport.pickOrgFirst'));
      return;
    }
    setGenerating(true); setError(null); setNotice(null);
    try {
      const body: { from: string; to: string; organizationId?: number } = { from, to };
      if (isSuperAdmin) body.organizationId = organizationId as number;
      const url = await apiFetchBlobPost('/tax-authority-export', body);
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

      <div className="card" style={{ padding: 20, maxWidth: 480 }}>
        {isSuperAdmin && (
          <>
            <label>{t('taxAuthorityExport.organization')}</label>
            <select
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value ? Number(e.target.value) : '')}
              style={{ width: '100%', marginBottom: 14 }}
            >
              <option value="">{t('taxAuthorityExport.pickOrg')}</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </>
        )}

        <label>{t('taxAuthorityExport.fromDate')}</label>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: '100%', marginBottom: 14 }} />

        <label>{t('taxAuthorityExport.toDate')}</label>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: '100%', marginBottom: 20 }} />

        {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}
        {notice && <div style={{ background: '#e6f4ea', color: '#1a7f37', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>{notice}</div>}

        <button type="button" onClick={generate} disabled={generating} style={{ width: '100%' }}>
          <FileDown size={15} /> {generating ? t('taxAuthorityExport.generating') : t('taxAuthorityExport.generate')}
        </button>
      </div>
    </div>
  );
}
