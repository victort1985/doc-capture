import { useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { Info, X } from 'lucide-react';

export default function AppPasswordHelp() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <span style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle', marginInlineStart: 6 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={t('appPasswordHelp.title')}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--ink-soft)', display: 'inline-flex' }}
      >
        <Info size={15} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} onClick={() => setOpen(false)} />
          <div
            className="card"
            style={{
              position: 'absolute', top: '100%', insetInlineStart: 0, marginTop: 6,
              width: 320, maxWidth: '90vw', zIndex: 301, fontSize: 13, lineHeight: 1.5,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <strong>{t('appPasswordHelp.title')}</strong>
              <button type="button" onClick={() => setOpen(false)} className="ghost" style={{ padding: 2 }}><X size={14} /></button>
            </div>
            <ol style={{ margin: 0, paddingInlineStart: 18 }}>
              <li style={{ marginBottom: 6 }}>{t('appPasswordHelp.step1')}</li>
              <li style={{ marginBottom: 6 }}>{t('appPasswordHelp.step2')}</li>
              <li style={{ marginBottom: 6 }}>
                <Trans i18nKey="appPasswordHelp.step3" components={{
                  a: <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" />,
                }} />
              </li>
              <li style={{ marginBottom: 6 }}>{t('appPasswordHelp.step4')}</li>
              <li style={{ marginBottom: 6 }}>{t('appPasswordHelp.step5')}</li>
              <li style={{ marginBottom: 6 }}>{t('appPasswordHelp.step6')}</li>
              <li>{t('appPasswordHelp.step7')}</li>
            </ol>
          </div>
        </>
      )}
    </span>
  );
}
