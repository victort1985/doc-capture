import type { CSSProperties } from 'react';

interface TemplatePickerProps {
  value: string;
  onChange: (v: string) => void;
  labels: { classic: string; modern: string; minimalist: string };
}

function MiniPreview({ kind }: { kind: 'classic' | 'modern' | 'minimalist' }) {
  const box: CSSProperties = { width: '100%', height: 92, borderRadius: 6, background: '#fff', overflow: 'hidden', position: 'relative', border: '1px solid var(--line, #e2e5ee)' };
  if (kind === 'classic') {
    return (
      <div style={box}>
        <div style={{ position: 'absolute', top: 8, left: 8, width: 24, height: 8, background: '#0e1642', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 8, right: 8, width: 34, height: 6, background: '#0e1642', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 20, left: 8, right: 8, height: 1, background: '#dcdfe6' }} />
        <div style={{ position: 'absolute', top: 30, right: 8, width: 40, height: 6, background: '#0e1642', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 44, left: 8, right: 8, height: 10, background: '#f4f6f8' }} />
        {[56, 66, 76].map((t) => (
          <div key={t} style={{ position: 'absolute', top: t, left: 8, right: 8, height: 6, borderBottom: '0.5px solid #eceef1' }} />
        ))}
      </div>
    );
  }
  if (kind === 'modern') {
    return (
      <div style={box}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 28, background: '#0e1642' }} />
        <div style={{ position: 'absolute', top: 9, right: 8, width: 30, height: 6, background: '#fff', borderRadius: 1 }} />
        <div style={{ position: 'absolute', top: 18, left: 8, width: 26, height: 6, background: '#F2701C', borderRadius: 3 }} />
        <div style={{ position: 'absolute', top: 36, left: 8, right: 8, height: 14, background: '#f4f6f8', borderRadius: 3 }} />
        {[58, 68, 78].map((t, i) => (
          <div key={t} style={{ position: 'absolute', top: t, left: 8, right: 8, height: 7, background: i % 2 ? '#f8f9fa' : 'transparent' }} />
        ))}
      </div>
    );
  }
  return (
    <div style={box}>
      <div style={{ position: 'absolute', top: 10, right: 8, width: 30, height: 5, background: '#1b1f2a', borderRadius: 1 }} />
      <div style={{ position: 'absolute', top: 22, left: 8, right: 8, height: 0.75, background: '#1b1f2a' }} />
      <div style={{ position: 'absolute', top: 30, right: 8, width: 20, height: 4, background: '#aaa' }} />
      {[46, 58, 70].map((t) => (
        <div key={t} style={{ position: 'absolute', top: t, left: 8, right: 8, height: 5, background: '#ddd' }} />
      ))}
      <div style={{ position: 'absolute', top: 82, left: 8, right: 8, height: 0.75, background: '#1b1f2a' }} />
    </div>
  );
}

export default function TemplatePicker({ value, onChange, labels }: TemplatePickerProps) {
  const options: { key: 'classic' | 'modern' | 'minimalist'; label: string }[] = [
    { key: 'classic', label: labels.classic },
    { key: 'modern', label: labels.modern },
    { key: 'minimalist', label: labels.minimalist },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
      {options.map((opt) => (
        <button
          type="button"
          key={opt.key}
          onClick={() => onChange(opt.key)}
          style={{
            padding: 8, borderRadius: 8, cursor: 'pointer', textAlign: 'center',
            border: value === opt.key ? '2px solid var(--primary, #0e1642)' : '1px solid var(--line, #e2e5ee)',
            background: value === opt.key ? 'var(--primary-wash, #eef0fa)' : '#fff',
          }}
        >
          <MiniPreview kind={opt.key} />
          <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>{opt.label}</div>
        </button>
      ))}
    </div>
  );
}
