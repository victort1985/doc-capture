import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch, apiFetchBlobPost } from '../services/api';
import TemplatePicker, { type TemplateKey } from '../components/TemplatePicker';

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

// A4 aspect ratio (595.28 x 841.89 pt) scaled down for the on-screen canvas.
const CANVAS_W = 420;
const CANVAS_H = Math.round(CANVAS_W * (841.89 / 595.28));

const DEFAULT_LOGO = { xPercent: 8, yPercent: 6, heightPercent: 4.5 };
const DEFAULT_COMPANY_INFO = { xPercent: 92, yPercent: 6 };

type DragMode = 'move' | 'resize' | 'company';

export default function TemplateDesignerPage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<DesignSettings | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<TemplateKey>('classic');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragMode = useRef<DragMode | null>(null);
  const dragStart = useRef<{ x: number; y: number; orig: { x: number; y: number; h: number } } | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const settingsRef = useRef<DesignSettings | null>(null);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

  useEffect(() => {
    apiFetch<DesignSettings | null>('/template-design')
      .then((s) => setSettings(s ?? {}))
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  const logo = {
    x: settings?.logoXPercent ?? DEFAULT_LOGO.xPercent,
    y: settings?.logoYPercent ?? DEFAULT_LOGO.yPercent,
    h: settings?.logoHeightPercent ?? DEFAULT_LOGO.heightPercent,
  };
  const companyInfo = {
    x: settings?.companyInfoXPercent ?? DEFAULT_COMPANY_INFO.xPercent,
    y: settings?.companyInfoYPercent ?? DEFAULT_COMPANY_INFO.yPercent,
  };

  // Real-document preview — re-rendered (debounced) whenever the
  // template or any design value changes, reflecting exactly what's
  // currently on screen (including values not saved yet). This is
  // what makes "looks exactly like the editor once saved" true: the
  // saved version and this preview both go through the identical
  // generateDocumentPdf() code path server-side.
  const refreshPreview = useCallback((s: DesignSettings, tmpl: TemplateKey) => {
    setPreviewLoading(true);
    apiFetchBlobPost('/template-design/preview', {
      template: tmpl,
      primaryColor: s.primaryColor ?? undefined,
      accentColor: s.accentColor ?? undefined,
      textColor: s.textColor ?? undefined,
      logoXPercent: s.logoXPercent ?? DEFAULT_LOGO.xPercent,
      logoYPercent: s.logoYPercent ?? DEFAULT_LOGO.yPercent,
      logoHeightPercent: s.logoHeightPercent ?? DEFAULT_LOGO.heightPercent,
      companyInfoXPercent: s.companyInfoXPercent ?? DEFAULT_COMPANY_INFO.xPercent,
      companyInfoYPercent: s.companyInfoYPercent ?? DEFAULT_COMPANY_INFO.yPercent,
    })
      .then((url) => {
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = url;
        setPreviewUrl(url);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to render preview'))
      .finally(() => setPreviewLoading(false));
  }, []);

  useEffect(() => {
    if (!settings) return;
    const handle = setTimeout(() => refreshPreview(settings, template), 350);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, template]);

  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current); }, []);

  async function save(patch: Partial<DesignSettings>) {
    setSaving(true); setError(null);
    try {
      const updated = await apiFetch<DesignSettings>('/template-design', { method: 'POST', body: JSON.stringify(patch) });
      setSettings(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  // Drag mechanics — attaches move/up listeners to `window` for the
  // duration of a drag rather than relying on React's onPointerMove/
  // onPointerUp on a specific element. The previous version attached
  // those only to the outer logo box, but the resize handle (an inner
  // child) captured the pointer onto ITSELF on pointerdown — once
  // captured, subsequent move/up events go to whatever element called
  // setPointerCapture, not wherever the listener happens to be
  // attached, so resize-dragging fired zero move/up events and
  // silently did nothing. Window-level listeners sidestep the whole
  // capture-target question entirely.
  function startDrag(e: React.PointerEvent, mode: DragMode) {
    e.preventDefault();
    e.stopPropagation();
    dragMode.current = mode;
    const orig = mode === 'company' ? { x: companyInfo.x, y: companyInfo.y, h: 0 } : { ...logo };
    dragStart.current = { x: e.clientX, y: e.clientY, orig };
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
  }

  function onWindowPointerMove(e: PointerEvent) {
    if (!dragMode.current || !dragStart.current) return;
    const { x: startX, y: startY, orig } = dragStart.current;
    const dxPct = ((e.clientX - startX) / CANVAS_W) * 100;
    const dyPct = ((e.clientY - startY) / CANVAS_H) * 100;

    if (dragMode.current === 'move') {
      const x = Math.max(0, Math.min(85, orig.x + dxPct));
      const y = Math.max(0, Math.min(90, orig.y + dyPct));
      setSettings((s) => ({ ...s, logoXPercent: x, logoYPercent: y }));
    } else if (dragMode.current === 'resize') {
      const h = Math.max(2, Math.min(20, orig.h + dyPct));
      setSettings((s) => ({ ...s, logoHeightPercent: h }));
    } else {
      const x = Math.max(15, Math.min(98, orig.x + dxPct));
      const y = Math.max(0, Math.min(90, orig.y + dyPct));
      setSettings((s) => ({ ...s, companyInfoXPercent: x, companyInfoYPercent: y }));
    }
  }

  function onWindowPointerUp() {
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    if (!dragMode.current) return;
    const mode = dragMode.current;
    dragMode.current = null;
    dragStart.current = null;

    const current = settingsRef.current;
    if (!current) return;
    if (mode === 'company') {
      save({ companyInfoXPercent: current.companyInfoXPercent ?? companyInfo.x, companyInfoYPercent: current.companyInfoYPercent ?? companyInfo.y });
    } else {
      save({ logoXPercent: current.logoXPercent ?? logo.x, logoYPercent: current.logoYPercent ?? logo.y, logoHeightPercent: current.logoHeightPercent ?? logo.h });
    }
  }

  // Cleanup window listeners if the component unmounts mid-drag.
  useEffect(() => () => {
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loaded) return <div className="page"><p>{t('common.loading')}</p></div>;

  const templateLabels: Record<TemplateKey, string> = {
    classic: t('documentSeries.templateClassic'), modern: t('documentSeries.templateModern'), minimalist: t('documentSeries.templateMinimalist'),
    ledger: t('documentSeries.templateLedger'), atelier: t('documentSeries.templateAtelier'), blueprint: t('documentSeries.templateBlueprint'),
    marquee: t('documentSeries.templateMarquee'), minimalMono: t('documentSeries.templateMinimalMono'), stampSeal: t('documentSeries.templateStampSeal'),
  };

  return (
    <div className="page">
      <div className="topbar">
        <div><div className="eyebrow">{t('templateDesigner.eyebrow')}</div><h1>{t('templateDesigner.title')}</h1></div>
      </div>

      <div className="card" style={{ marginBottom: 16, padding: 16, fontSize: 13 }}>
        {t('templateDesigner.disclaimer')}
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t('templateDesigner.chooseTemplate')}</h3>
        <TemplatePicker value={template} onChange={(v) => setTemplate(v as TemplateKey)} labels={templateLabels} />
      </div>

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
            ref={canvasRef}
            style={{
              width: CANVAS_W, height: CANVAS_H, background: '#fff', border: '1px solid var(--border, #ddd)',
              borderRadius: 4, position: 'relative', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', overflow: 'hidden',
            }}
          >
            {previewUrl && (
              <img
                src={previewUrl}
                alt=""
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: previewLoading ? 0.5 : 1, transition: 'opacity 0.15s' }}
              />
            )}
            {!previewUrl && previewLoading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, color: 'var(--ink-soft)' }}>
                {t('templateDesigner.renderingPreview')}
              </div>
            )}

            {/* Logo box — draggable, resizable via bottom-right handle.
                Positioned in top-left-origin % over the rendered preview
                image, the same coordinate system the PDF renderer itself
                uses, so the overlay always lines up with where the real
                logo is drawn underneath. */}
            <div
              style={{
                position: 'absolute',
                left: `${logo.x}%`, top: `${logo.y}%`, height: `${logo.h}%`,
                width: `${logo.h * (CANVAS_H / CANVAS_W) * 1.6}%`,
                border: '1.5px dashed rgba(29,53,87,0.9)', borderRadius: 3, background: 'rgba(29,53,87,0.08)',
                cursor: 'move', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onPointerDown={(e) => startDrag(e, 'move')}
            >
              <span style={{ fontSize: 8, color: '#1D3557', fontWeight: 700, pointerEvents: 'none', background: '#fff', padding: '0 3px' }}>{t('templateDesigner.logoLabel')}</span>
              <div
                onPointerDown={(e) => startDrag(e, 'resize')}
                style={{ position: 'absolute', bottom: -6, right: -6, width: 12, height: 12, background: '#1D3557', borderRadius: '50%', cursor: 'nwse-resize', border: '2px solid #fff' }}
              />
            </div>

            {/* Company info anchor — draggable point */}
            <div
              onPointerDown={(e) => startDrag(e, 'company')}
              style={{
                position: 'absolute', left: `${companyInfo.x}%`, top: `${companyInfo.y}%`,
                transform: 'translate(-100%, 0)', cursor: 'move', padding: '4px 8px',
                background: 'rgba(242,112,28,0.15)', border: '1.5px dashed #F2701C', borderRadius: 3,
              }}
            >
              <span style={{ fontSize: 8, color: '#F2701C', fontWeight: 700, whiteSpace: 'nowrap' }}>{t('templateDesigner.companyInfoLabel')}</span>
            </div>
          </div>
          <p style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 10 }}>{t('templateDesigner.dragHint')}</p>
        </div>
      </div>
    </div>
  );
}
