import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileDown, AlertTriangle } from 'lucide-react';
import { apiFetchBlobPostWithHeaders } from '../services/api';
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

  const [generatingReport, setGeneratingReport] = useState<'2.6' | '5.4' | null>(null);

  async function generate() {
    setGenerating(true); setError(null); setNotice(null);
    try {
      const { url, headers } = await apiFetchBlobPostWithHeaders('/tax-authority-export', { from, to });
      const a = document.createElement('a');
      a.href = url;
      a.download = `openformat-${from}-to-${to}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      const exceedsLimit = headers.get('X-Exceeds-Simulator-Limit') === 'true';
      const sizeBytes = Number(headers.get('X-Bkmvdata-Size-Bytes') ?? 0);
      const vatChecksumValid = headers.get('X-Vat-Checksum-Valid') !== 'false';
      const warnings: string[] = [];
      if (exceedsLimit) warnings.push(t('taxAuthorityExport.exceedsSimulatorLimit', { size: (sizeBytes / 1024 / 1024).toFixed(1) }));
      if (!vatChecksumValid) warnings.push(t('taxAuthorityExport.invalidVatChecksum'));
      if (warnings.length > 0) {
        setError(warnings.join(' '));
      } else {
        setNotice(t('taxAuthorityExport.downloadStarted'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate export');
    } finally {
      setGenerating(false);
    }
  }

  /** Downloads one of the two printed reports the registration form
   * itself requires as attachments alongside the simulator's own
   * report — see ComplianceReportsService for what each represents. */
  async function generateComplianceReport(kind: '2.6' | '5.4') {
    setGeneratingReport(kind); setError(null); setNotice(null);
    try {
      const { url } = await apiFetchBlobPostWithHeaders(`/tax-authority-export/section-${kind.replace('.', '-')}`, { from, to });
      const a = document.createElement('a');
      a.href = url;
      a.download = `section-${kind}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setNotice(t('taxAuthorityExport.downloadStarted'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate report');
    } finally {
      setGeneratingReport(null);
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

      <div className="card" style={{ padding: 20, maxWidth: 480, marginTop: 16 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>{t('taxAuthorityExport.complianceReportsTitle')}</div>
        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--ink-soft)' }}>{t('taxAuthorityExport.complianceReportsHint')}</p>

        <button
          type="button"
          onClick={() => generateComplianceReport('2.6')}
          disabled={generatingReport !== null || (isSuperAdmin && !isActingAsOrg)}
          style={{ width: '100%', marginBottom: 10 }}
        >
          <FileDown size={15} /> {generatingReport === '2.6' ? t('taxAuthorityExport.generating') : t('taxAuthorityExport.section26Button')}
        </button>

        <button
          type="button"
          onClick={() => generateComplianceReport('5.4')}
          disabled={generatingReport !== null || (isSuperAdmin && !isActingAsOrg)}
          style={{ width: '100%' }}
        >
          <FileDown size={15} /> {generatingReport === '5.4' ? t('taxAuthorityExport.generating') : t('taxAuthorityExport.section54Button')}
        </button>
      </div>
    </div>
  );
}
