import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

interface DesignSettings {
  primaryColor?: string | null;
  accentColor?: string | null;
  textColor?: string | null;
  logoXPercent?: number | null;
  logoYPercent?: number | null;
  logoHeightPercent?: number | null;
  companyInfoXPercent?: number | null;
  companyInfoYPercent?: number | null;
}

// A4 aspect ratio (595.28 x 841.89 pt) scaled down for an on-screen mockup.
const MOCKUP_W = 360;
const MOCKUP_H = Math.round(MOCKUP_W * (841.89 / 595.28));

const DEFAULT_LOGO = { xPercent: 8, yPercent: 6, heightPercent: 4.5 };
const DEFAULT_COMPANY_INFO = { xPercent: 92, yPercent: 6 };

export default function TemplateDesignerPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<DesignSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ mode: 'move' | 'resize'; startX: number; startY: number; orig: { x: number; y: number; h: number } } | null>(null);

  useEffect(() => {
    apiFetch<DesignSettings | null>('/template-design')
      .then((s) => setSettings(s ?? {}))
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  async function save(patch: Partial<DesignSettings>) {
    setSaving(true); setError(null);
    try {
      const updated = await apiFetch<DesignSettings>('/template-design', { method: 'POST', body: JSON.stringify(patch) });
      setSettings(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  const logo = {
    x: settings?.logoXPercent ?? DEFAULT_LOGO.xPercent,
    y: settings?.logoYPercent ?? DEFAULT_LOGO.yPercent,
    h: settings?.logoHeightPercent ?? DEFAULT_LOGO.heightPercent,
  };
  const companyInfo = {
    x: settings?.companyInfoXPercent ?? DEFAULT_COMPANY_INFO.xPercent,
    y: settings?.companyInfoYPercent ?? DEFAULT_COMPANY_INFO.yPercent,
  };

  function startDrag(e: React.PointerEvent, mode: 'move' | 'resize') {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { mode, startX: e.clientX, startY: e.clientY, orig: { ...logo } };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current || !mockupRef.current) return;
    const { mode, startX, startY, orig } = dragState.current;
    const dxPct = ((e.clientX - startX) / MOCKUP_W) * 100;
    const dyPct = ((e.clientY - startY) / MOCKUP_H) * 100;
    if (mode === 'move') {
      const x = Math.max(0, Math.min(85, orig.x + dxPct));
      const y = Math.max(0, Math.min(90, orig.y + dyPct));
      setSettings((s) => ({ ...s, logoXPercent: x, logoYPercent: y }));
    } else {
      const h = Math.max(2, Math.min(20, orig.h + dyPct));
      setSettings((s) => ({ ...s, logoHeightPercent: h }));
    }
  }

  function endDrag() {
    if (!dragState.current || !settings) { dragState.current = null; return; }
    dragState.current = null;
    save({ logoXPercent: settings.logoXPercent ?? logo.x, logoYPercent: settings.logoYPercent ?? logo.y, logoHeightPercent: settings.logoHeightPercent ?? logo.h });
  }

  function startCompanyDrag(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { mode: 'move', startX: e.clientX, startY: e.clientY, orig: { x: companyInfo.x, y: companyInfo.y, h: 0 } };
  }

  function onCompanyPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const { startX, startY, orig } = dragState.current;
    const dxPct = ((e.clientX - startX) / MOCKUP_W) * 100;
    const dyPct = ((e.clientY - startY) / MOCKUP_H) * 100;
    const x = Math.max(15, Math.min(98, orig.x + dxPct));
    const y = Math.max(0, Math.min(90, orig.y + dyPct));
    setSettings((s) => ({ ...s, companyInfoXPercent: x, companyInfoYPercent: y }));
  }

  function endCompanyDrag() {
    if (!dragState.current || !settings) { dragState.current = null; return; }
    dragState.current = null;
    save({ companyInfoXPercent: settings.companyInfoXPercent ?? companyInfo.x, companyInfoYPercent: settings.companyInfoYPercent ?? companyInfo.y });
  }

  if (!loaded) return <div className="page"><p>{t('common.loading')}</p></div>;

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('templateDesigner.eyebrow')}</div><h1>{t('templateDesigner.title')}</h1></div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, fontSize: 13 }}>
        {t('templateDesigner.disclaimer')}
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24, alignItems: 'start' }}>
        <div className="card" style={{ padding: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t('templateDesigner.colors')}</h3>

          <label style={{ display: 'block', marginBottom: 4, fontSize: 12.5 }}>{t('templateDesigner.primaryColor')}</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
            <input type="color" value={settings?.primaryColor ?? '#1D3557'} onChange={(e) => { setSettings((s) => ({ ...s, primaryColor: e.target.value })); }} onBlur={() => save({ primaryColor: settings?.primaryColor ?? undefined })} style={{ width: 40, height: 32, padding: 0, border: 'none' }} />
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--ink-soft)' }}>{settings?.primaryColor ?? t('templateDesigner.usingDefault')}</span>
          </div>

          <label style={{ display: 'block', marginBottom: 4, fontSize: 12.5 }}>{t('templateDesigner.accentColor')}</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
            <input type="color" value={settings?.accentColor ?? '#F2701C'} onChange={(e) => { setSettings((s) => ({ ...s, accentColor: e.target.value })); }} onBlur={() => save({ accentColor: settings?.accentColor ?? undefined })} style={{ width: 40, height: 32, padding: 0, border: 'none' }} />
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--ink-soft)' }}>{settings?.accentColor ?? t('templateDesigner.usingDefault')}</span>
          </div>

          <label style={{ display: 'block', marginBottom: 4, fontSize: 12.5 }}>{t('templateDesigner.textColor')}</label>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'center' }}>
            <input type="color" value={settings?.textColor ?? '#222222'} onChange={(e) => { setSettings((s) => ({ ...s, textColor: e.target.value })); }} onBlur={() => save({ textColor: settings?.textColor ?? undefined })} style={{ width: 40, height: 32, padding: 0, border: 'none' }} />
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--ink-soft)' }}>{settings?.textColor ?? t('templateDesigner.usingDefault')}</span>
          </div>

          <p style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 16 }}>{t('templateDesigner.colorsHint')}</p>
          {saving && <p style={{ fontSize: 11.5, color: 'var(--ink-soft)' }}>{t('common.saving')}</p>}
        </div>

        <div>
          <h3 style={{ marginTop: 0 }}>{t('templateDesigner.layout')}</h3>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 0, marginBottom: 14 }}>{t('templateDesigner.layoutHint')}</p>
          <div
            ref={mockupRef}
            style={{
              width: MOCKUP_W, height: MOCKUP_H, background: '#fff', border: '1px solid var(--border, #ddd)',
              borderRadius: 4, position: 'relative', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', direction: 'rtl',
            }}
          >
            {/* Logo box — draggable, resizable via bottom-right handle */}
            <div
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              style={{
                position: 'absolute',
                left: `${logo.x}%`, top: `${logo.y}%`, height: `${logo.h}%`,
                width: `${logo.h * (MOCKUP_H / MOCKUP_W) * 1.6}%`,
                background: 'repeating-linear-gradient(45deg, #eef0fa, #eef0fa 4px, #fff 4px, #fff 8px)',
                border: '1.5px dashed var(--primary, #1D3557)', borderRadius: 3,
                cursor: 'move', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onPointerDown={(e) => startDrag(e, 'move')}
            >
              <span style={{ fontSize: 8, color: 'var(--primary, #1D3557)', fontWeight: 700, pointerEvents: 'none' }}>{t('templateDesigner.logoLabel')}</span>
              <div
                onPointerDown={(e) => startDrag(e, 'resize')}
                style={{ position: 'absolute', bottom: -5, right: -5, width: 10, height: 10, background: 'var(--primary, #1D3557)', borderRadius: '50%', cursor: 'nwse-resize' }}
              />
            </div>

            {/* Company info anchor — draggable point */}
            <div
              onPointerMove={onCompanyPointerMove}
              onPointerUp={endCompanyDrag}
              onPointerDown={startCompanyDrag}
              style={{
                position: 'absolute', left: `${companyInfo.x}%`, top: `${companyInfo.y}%`,
                transform: 'translate(-100%, 0)', cursor: 'move', padding: '4px 8px',
                background: 'rgba(242,112,28,0.08)', border: '1.5px dashed var(--stamp, #F2701C)', borderRadius: 3,
              }}
            >
              <span style={{ fontSize: 8, color: 'var(--stamp, #F2701C)', fontWeight: 700, whiteSpace: 'nowrap' }}>{t('templateDesigner.companyInfoLabel')}</span>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 10 }}>{t('templateDesigner.dragHint')}</p>
        </div>
      </div>
    </div>
  );
}
