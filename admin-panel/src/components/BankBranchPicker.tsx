import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '../services/api';

interface BankReference {
  code: string;
  name: string;
  nameEn?: string;
  status: 'active' | 'historical' | 'special';
}

interface BankBranch {
  id: number;
  bankCode: string;
  branchNumber: string;
  branchName?: string;
  city?: string;
}

/** Generic "type to search, pick from a dropdown" input — shared by
 * both the bank and branch pickers below rather than duplicating the
 * same debounce/dropdown/click-outside logic twice. */
function SearchableInput<T>({
  value, onSelect, search, renderOption, getLabel, placeholder, disabled,
}: {
  value: string;
  onSelect: (item: T) => void;
  search: (q: string) => Promise<T[]>;
  renderOption: (item: T) => React.ReactNode;
  getLabel: (item: T) => string;
  placeholder: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  const [options, setOptions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setText(value), [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const results = await search(text);
        if (!cancelled) setOptions(results);
      } catch {
        if (!cancelled) setOptions([]);
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [text, open, search]);

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        value={text}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        style={{ width: '100%' }}
      />
      {open && options.length > 0 && (
        <div
          style={{
            position: 'absolute', zIndex: 20, top: '100%', insetInlineStart: 0, insetInlineEnd: 0,
            background: 'var(--surface, #fff)', border: '1px solid var(--border, #ddd)', borderRadius: 8,
            marginTop: 4, maxHeight: 240, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          }}
        >
          {options.map((item, i) => (
            <div
              key={i}
              onClick={() => { onSelect(item); setText(getLabel(item)); setOpen(false); }}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border-soft, #f0f0f0)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-muted, #f7f7f7)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {renderOption(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface BankBranchValue {
  bankName: string;
  branchNumber: string;
}

/** For forms that only ever collect the bank itself, not a branch
 * (e.g. a bank-transfer reference where the branch isn't captured
 * separately) — same search behavior as the bank half of
 * BankBranchPicker below, without requiring a paired branch field. */
export function BankNamePicker({ bankName, onChange }: { bankName: string; onChange: (bankName: string) => void }) {
  const { t } = useTranslation();
  return (
    <SearchableInput<BankReference>
      value={bankName}
      placeholder={t('payments.bankName')}
      search={(q) => apiFetch<BankReference[]>(`/banks?q=${encodeURIComponent(q)}`)}
      getLabel={(b) => b.name}
      renderOption={(b) => (
        <span>
          <strong>{b.code}</strong> — {b.name}{b.nameEn ? ` (${b.nameEn})` : ''}
          {b.status !== 'active' && <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}> · {t(`banks.status_${b.status}`)}</span>}
        </span>
      )}
      onSelect={(b) => onChange(b.name)}
    />
  );
}

/** Two side-by-side searchable inputs: bank (by code, Hebrew, or
 * English name) and branch (scoped to whichever bank is currently
 * selected, searchable by number/name/city). Writes back the SAME
 * flat bankName/branchNumber strings the existing Payment/Expense
 * forms already use — no schema change needed on the fields this
 * plugs into, just a better way to fill them in than free text. */
export default function BankBranchPicker({
  bankName, branchNumber, onChange,
}: {
  bankName: string;
  branchNumber: string;
  onChange: (value: BankBranchValue) => void;
}) {
  const { t } = useTranslation();
  const [selectedBankCode, setSelectedBankCode] = useState<string | null>(null);

  return (
    <>
      <SearchableInput<BankReference>
        value={bankName}
        placeholder={t('payments.bankName')}
        search={(q) => apiFetch<BankReference[]>(`/banks?q=${encodeURIComponent(q)}`)}
        getLabel={(b) => b.name}
        renderOption={(b) => (
          <span>
            <strong>{b.code}</strong> — {b.name}{b.nameEn ? ` (${b.nameEn})` : ''}
            {b.status !== 'active' && <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}> · {t(`banks.status_${b.status}`)}</span>}
          </span>
        )}
        onSelect={(b) => { setSelectedBankCode(b.code); onChange({ bankName: b.name, branchNumber }); }}
      />
      <SearchableInput<BankBranch>
        value={branchNumber}
        placeholder={selectedBankCode ? t('payments.branchNumber') : t('payments.pickBankFirst')}
        disabled={!selectedBankCode}
        search={(q) => (selectedBankCode ? apiFetch<BankBranch[]>(`/banks/branches?bankCode=${selectedBankCode}&q=${encodeURIComponent(q)}`) : Promise.resolve([]))}
        getLabel={(b) => b.branchNumber}
        renderOption={(b) => (
          <span>
            <strong>{b.branchNumber}</strong>
            {b.branchName ? ` — ${b.branchName}` : ''}
            {b.city ? ` (${b.city})` : ''}
          </span>
        )}
        onSelect={(b) => onChange({ bankName, branchNumber: b.branchNumber })}
      />
    </>
  );
}
