interface StampMarkProps {
  size?: number;
  animated?: boolean;
  className?: string;
}

/**
 * The brand mark: a circular ink-stamp impression with a folded-document
 * glyph at its center. Reused as the sidebar mark, the login mark (with
 * the one-time "stamp impact" entrance animation), and as a faint motif
 * in empty states.
 */
export default function StampMark({ size = 32, animated = false, className }: StampMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={`stamp-mark ${animated ? 'animated' : ''} ${className || ''}`}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="21" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="24" cy="24" r="15.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" opacity="0.6" />
      <path
        d="M17 15h10l4 4v14a1 1 0 0 1-1 1H17a1 1 0 0 1-1-1V16a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M27 15v4h4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M19.5 25.5l3 3 6-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
