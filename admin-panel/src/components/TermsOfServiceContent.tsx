import { useTranslation } from 'react-i18next';
import { TOS_CONTENT } from '../data/tos-content';

export default function TermsOfServiceContent() {
  const { i18n } = useTranslation();
  const lang = (['en', 'ru', 'he'] as const).includes(i18n.language as any) ? (i18n.language as 'en' | 'ru' | 'he') : 'en';
  const content = TOS_CONTENT[lang];
  const rtl = lang === 'he';

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ textAlign: rtl ? 'right' : 'left', fontSize: 13.5, lineHeight: 1.6 }}>
      <h2 style={{ textAlign: 'center', marginBottom: 2 }}>{content.title}</h2>
      <p style={{ textAlign: 'center', color: 'var(--ink-soft)', marginBottom: 20 }}>{content.subtitle}</p>
      {content.sections.map((sec, i) => (
        <div key={i} style={{ marginBottom: 18 }}>
          <h3 style={{ color: 'var(--primary)', fontSize: 15, marginBottom: 8 }}>{sec.title}</h3>
          {sec.blocks.map((block, j) => {
            if (block.type === 'bullet') {
              return <li key={j} style={{ marginBottom: 4, marginInlineStart: 18 }}>{block.text}</li>;
            }
            return (
              <p key={j} style={{ fontWeight: block.bold || block.type === 'upper' ? 700 : 400, textTransform: block.type === 'upper' ? 'uppercase' : 'none', fontSize: block.type === 'upper' ? 12.5 : 13.5, marginBottom: 8 }}>
                {block.text}
              </p>
            );
          })}
        </div>
      ))}
    </div>
  );
}
