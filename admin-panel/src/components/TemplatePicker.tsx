import type { CSSProperties } from 'react';

export type TemplateKey = 'classic' | 'modern' | 'minimalist' | 'ledger' | 'atelier' | 'blueprint' | 'marquee' | 'minimalMono' | 'stampSeal';

interface TemplatePickerProps {
  value: string;
  onChange: (v: string) => void;
  labels: Record<TemplateKey, string>;
}

const box: CSSProperties = { width: '100%', height: 92, borderRadius: 6, background: '#fff', overflow: 'hidden', position: 'relative', border: '1px solid var(--line, #e2e5ee)' };

function MiniPreview({ kind }: { kind: TemplateKey }) {
  switch (kind) {
    case 'classic':
      return (
        <div style={box}>
          <div style={{ position: 'absolute', top: 8, left: 8, width: 24, height: 8, background: '#0e1642', borderRadius: 1 }} />
          <div style={{ position: 'absolute', top: 8, right: 8, width: 34, height: 6, background: '#0e1642', borderRadius: 1 }} />
          <div style={{ position: 'absolute', top: 20, left: 8, right: 8, height: 1, background: '#dcdfe6' }} />
          <div style={{ position: 'absolute', top: 30, right: 8, width: 40, height: 6, background: '#0e1642', borderRadius: 1 }} />
          <div style={{ position: 'absolute', top: 44, left: 8, right: 8, height: 10, background: '#f4f6f8' }} />
          {[56, 66, 76].map((t) => (<div key={t} style={{ position: 'absolute', top: t, left: 8, right: 8, height: 6, borderBottom: '0.5px solid #eceef1' }} />))}
        </div>
      );
    case 'modern':
      return (
        <div style={box}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28, background: '#0e1642' }} />
          <div style={{ position: 'absolute', top: 9, right: 8, width: 30, height: 6, background: '#fff', borderRadius: 1 }} />
          <div style={{ position: 'absolute', top: 18, left: 8, width: 26, height: 6, background: '#F2701C', borderRadius: 3 }} />
          <div style={{ position: 'absolute', top: 36, left: 8, right: 8, height: 14, background: '#f4f6f8', borderRadius: 3 }} />
          {[58, 68, 78].map((t, i) => (<div key={t} style={{ position: 'absolute', top: t, left: 8, right: 8, height: 7, background: i % 2 ? '#f8f9fa' : 'transparent' }} />))}
        </div>
      );
    case 'minimalist':
      return (
        <div style={box}>
          <div style={{ position: 'absolute', top: 10, right: 8, width: 30, height: 5, background: '#1b1f2a', borderRadius: 1 }} />
          <div style={{ position: 'absolute', top: 22, left: 8, right: 8, height: 0.75, background: '#1b1f2a' }} />
          <div style={{ position: 'absolute', top: 30, right: 8, width: 20, height: 4, background: '#aaa' }} />
          {[46, 58, 70].map((t) => (<div key={t} style={{ position: 'absolute', top: t, left: 8, right: 8, height: 5, background: '#ddd' }} />))}
          <div style={{ position: 'absolute', top: 82, left: 8, right: 8, height: 0.75, background: '#1b1f2a' }} />
        </div>
      );
    case 'ledger':
      return (
        <div style={{ ...box, background: '#FAF8F3' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: '#1B2A4A' }} />
          <div style={{ position: 'absolute', top: 10, right: 8, width: 34, height: 6, background: '#1B2A4A', borderRadius: 1 }} />
          <div style={{ position: 'absolute', top: 22, left: 8, right: 8, height: 1.5, background: '#1B2A4A' }} />
          <div style={{ position: 'absolute', top: 25, left: 8, right: 8, height: 0.5, background: '#B8935B' }} />
          <div style={{ position: 'absolute', top: 34, right: 8, width: 44, height: 6, background: '#1B2A4A', borderRadius: 1 }} />
          {[48, 58, 68].map((t) => (<div key={t} style={{ position: 'absolute', top: t, left: 8, right: 8, height: 5, borderBottom: '0.5px solid #E4DCC8' }} />))}
        </div>
      );
    case 'atelier':
      return (
        <div style={{ ...box, background: '#FBF9F4' }}>
          <div style={{ position: 'absolute', top: 6, left: 6, width: 12, height: 12, borderTop: '1.2px solid #C99A87', borderLeft: '1.2px solid #C99A87' }} />
          <div style={{ position: 'absolute', top: 6, right: 6, width: 12, height: 12, borderTop: '1.2px solid #C99A87', borderRight: '1.2px solid #C99A87' }} />
          <div style={{ position: 'absolute', top: 16, right: 8, width: 36, height: 7, background: '#6B7C5E', borderRadius: 1 }} />
          <div style={{ position: 'absolute', top: 30, right: 8, width: 24, height: 5, background: '#C99A87' }} />
          {[48, 58, 68].map((t) => (<div key={t} style={{ position: 'absolute', top: t, left: 8, right: 8, height: 5, borderBottom: '0.5px solid #EFE7DC' }} />))}
        </div>
      );
    case 'blueprint':
      return (
        <div style={{ ...box, background: '#F5F9FB' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 26, background: '#1E4D6B' }} />
          <div style={{ position: 'absolute', top: 8, right: 8, width: 34, height: 6, background: '#fff', borderRadius: 1 }} />
          <div style={{ position: 'absolute', top: 32, left: 8, right: 8, height: 1.5, background: '#E67E22' }} />
          <div style={{ position: 'absolute', top: 40, right: 8, width: 40, height: 6, background: '#1E4D6B', borderRadius: 1 }} />
          {[54, 64, 74].map((t) => (<div key={t} style={{ position: 'absolute', top: t, left: 8, right: 8, height: 5, borderBottom: '0.5px solid #D6E4EA' }} />))}
        </div>
      );
    case 'marquee':
      return (
        <div style={box}>
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 5, background: 'repeating-linear-gradient(180deg, #ddd 0 2px, transparent 2px 8px)' }} />
          <div style={{ position: 'absolute', top: 8, right: 8, width: 34, height: 6, background: '#4A1942', borderRadius: 1 }} />
          <div style={{ position: 'absolute', top: 22, left: 10, right: 8, height: 16, background: '#4A1942', borderRadius: 2 }} />
          {[46, 56, 66].map((t) => (<div key={t} style={{ position: 'absolute', top: t, left: 10, right: 8, height: 5, borderBottom: '0.5px solid #eee' }} />))}
          <div style={{ position: 'absolute', top: 78, right: 8, width: 26, height: 7, background: '#FFB627', borderRadius: 1 }} />
        </div>
      );
    case 'minimalMono':
      return (
        <div style={box}>
          <div style={{ position: 'absolute', top: 10, right: 8, width: 26, height: 4, background: '#666' }} />
          <div style={{ position: 'absolute', top: 20, right: 8, width: 46, height: 10, background: '#111' }} />
          <div style={{ position: 'absolute', top: 36, left: 8, right: 8, height: 0.5, background: '#ddd' }} />
          {[46, 56, 66].map((t) => (<div key={t} style={{ position: 'absolute', top: t, left: 8, right: 8, height: 4, background: '#eee' }} />))}
          <div style={{ position: 'absolute', top: 78, right: 8, width: 34, height: 9, background: '#111' }} />
        </div>
      );
    case 'stampSeal':
      return (
        <div style={{ ...box, background: '#F8F2E4', border: '1.5px solid #A67C3D' }}>
          <div style={{ position: 'absolute', top: 10, left: 10, width: 14, height: 14, borderRadius: '50%', border: '1.2px solid #A67C3D' }} />
          <div style={{ position: 'absolute', top: 13, left: 13, width: 8, height: 8, borderRadius: '50%', border: '0.7px solid #A67C3D' }} />
          <div style={{ position: 'absolute', top: 12, right: 8, width: 36, height: 6, background: '#6B1E23', borderRadius: 1 }} />
          <div style={{ position: 'absolute', top: 30, left: 8, right: 8, height: 0.75, background: '#A67C3D' }} />
          {[42, 52, 62].map((t) => (<div key={t} style={{ position: 'absolute', top: t, left: 8, right: 8, height: 5, borderBottom: '0.5px solid #EBDFC5' }} />))}
        </div>
      );
  }
}

const ORDER: TemplateKey[] = ['classic', 'modern', 'minimalist', 'ledger', 'atelier', 'blueprint', 'marquee', 'minimalMono', 'stampSeal'];

export default function TemplatePicker({ value, onChange, labels }: TemplatePickerProps) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
      {ORDER.map((key) => (
        <button
          type="button"
          key={key}
          onClick={() => onChange(key)}
          style={{
            padding: 8, borderRadius: 8, cursor: 'pointer', textAlign: 'center',
            border: value === key ? '2px solid var(--primary, #0e1642)' : '1px solid var(--line, #e2e5ee)',
            background: value === key ? 'var(--primary-wash, #eef0fa)' : '#fff',
          }}
        >
          <MiniPreview kind={key} />
          <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>{labels[key]}</div>
        </button>
      ))}
    </div>
  );
}
