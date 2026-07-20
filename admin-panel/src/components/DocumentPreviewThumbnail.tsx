interface PreviewItem { description: string; quantity: number; unitPrice: number; }

interface DocumentPreviewThumbnailProps {
  docNumber?: string | null;
  clientName: string;
  date?: string | null;
  items: PreviewItem[];
  total: number;
  template?: string;
  onClick?: () => void;
}

const CURRENCY = (n: number) => `₪${n.toFixed(2)}`;

export default function DocumentPreviewThumbnail({ docNumber, clientName, date, items, total, template = 'classic', onClick }: DocumentPreviewThumbnailProps) {
  const shownItems = items.slice(0, 3);
  const moreCount = items.length - shownItems.length;

  const wrapStyle = {
    width: 116, height: 150, borderRadius: 7, background: '#fff', overflow: 'hidden', position: 'relative' as const,
    border: '1px solid var(--line, #e2e5ee)', cursor: onClick ? 'pointer' : 'default', flexShrink: 0,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)', transition: 'transform .12s, box-shadow .12s',
  };

  if (template === 'modern') {
    return (
      <div style={wrapStyle} onClick={onClick} title={clientName}>
        <div style={{ height: 30, background: '#0e1642', padding: '5px 8px' }}>
          <div style={{ color: '#fff', fontSize: 8, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{docNumber || ''}</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 6.5 }}>{date || ''}</div>
        </div>
        <div style={{ padding: '6px 8px' }}>
          <div style={{ fontSize: 8, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>{clientName}</div>
          {shownItems.map((it, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6.5, color: '#555', padding: '2px 0', background: i % 2 ? '#f8f9fa' : 'transparent' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 60 }}>{it.description}</span>
              <span>{it.quantity}</span>
            </div>
          ))}
          {moreCount > 0 && <div style={{ fontSize: 6, color: '#999', marginTop: 2 }}>+{moreCount} more</div>}
        </div>
        <div style={{ position: 'absolute', bottom: 6, left: 8, right: 8, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ background: '#F2701C', color: '#fff', fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 3 }}>{CURRENCY(total)}</div>
        </div>
      </div>
    );
  }

  if (template === 'minimalist') {
    return (
      <div style={{ ...wrapStyle, padding: 10 }} onClick={onClick} title={clientName}>
        <div style={{ fontSize: 8, fontWeight: 700 }}>{clientName}</div>
        <div style={{ fontSize: 6.5, color: '#888', marginBottom: 6 }}>{docNumber} {date ? `· ${date}` : ''}</div>
        <div style={{ borderTop: '0.75px solid #222', marginBottom: 6 }} />
        {shownItems.map((it, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6.5, color: '#333', padding: '2px 0' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 70 }}>{it.description}</span>
            <span>{it.quantity}</span>
          </div>
        ))}
        {moreCount > 0 && <div style={{ fontSize: 6, color: '#999' }}>+{moreCount} more</div>}
        <div style={{ position: 'absolute', bottom: 10, left: 10, right: 10, borderTop: '0.75px solid #222', paddingTop: 4, textAlign: 'right', fontSize: 8, fontWeight: 700 }}>
          {CURRENCY(total)}
        </div>
      </div>
    );
  }

  // classic (default)
  return (
    <div style={{ ...wrapStyle, padding: 8 }} onClick={onClick} title={clientName}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 7, color: '#888' }}>{date}</div>
        <div style={{ fontSize: 8, fontWeight: 700, color: '#0e1642' }}>{docNumber}</div>
      </div>
      <div style={{ height: 1, background: '#e2e5ee', margin: '5px 0' }} />
      <div style={{ fontSize: 8, fontWeight: 700, textAlign: 'right', marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clientName}</div>
      <div style={{ background: '#f4f6f8', fontSize: 6, color: '#888', padding: '2px 4px', marginBottom: 3 }}>Items</div>
      {shownItems.map((it, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 6.5, padding: '2px 0', borderBottom: '0.5px solid #eceef1' }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 60 }}>{it.description}</span>
          <span>{it.quantity}</span>
        </div>
      ))}
      {moreCount > 0 && <div style={{ fontSize: 6, color: '#999', marginTop: 2 }}>+{moreCount} more</div>}
      <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, textAlign: 'right', fontSize: 9, fontWeight: 700, color: '#0e1642' }}>
        {CURRENCY(total)}
      </div>
    </div>
  );
}
