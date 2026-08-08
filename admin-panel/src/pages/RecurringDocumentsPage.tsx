import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, Play, Trash2, Pause, PlayCircle, Repeat } from 'lucide-react';
import { apiFetch } from '../services/api';

interface RecurringTemplate {
  id: number;
  name: string;
  documentType: 'expense' | 'invoice';
  dayOfMonth: number;
  templateData: Record<string, any>;
  nextRunDate: string;
  lastRunDate?: string | null;
  active: boolean;
  generatedLog: { documentId: number; date: string }[];
}

function CreateTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [documentType, setDocumentType] = useState<'expense' | 'invoice'>('expense');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  // Expense fields
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  // Invoice fields
  const [clientName, setClientName] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true); setError(null);
    try {
      const templateData = documentType === 'expense'
        ? { description, amount: Number(amount), method }
        : { clientName, items: [{ description: itemDescription, quantity: 1, unitPrice: Number(unitPrice) }] };
      await apiFetch('/recurring-documents', {
        method: 'POST',
        body: JSON.stringify({ name, documentType, dayOfMonth: Number(dayOfMonth), templateData }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create template');
    } finally { setSaving(false); }
  }

  const canSubmit = name.trim() && (documentType === 'expense' ? description.trim() && amount : clientName.trim() && itemDescription.trim() && unitPrice);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 460 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('recurringDocuments.newTemplate')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <label>{t('recurringDocuments.templateName')}</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('recurringDocuments.templateNameHint')} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('recurringDocuments.documentType')}</label>
        <select value={documentType} onChange={e => setDocumentType(e.target.value as any)} style={{ width: '100%', marginBottom: 10 }}>
          <option value="expense">{t('recurringDocuments.typeExpense')}</option>
          <option value="invoice">{t('recurringDocuments.typeInvoice')}</option>
        </select>
        <label>{t('recurringDocuments.dayOfMonth')}</label>
        <input type="number" min={1} max={28} value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />

        {documentType === 'expense' ? (
          <>
            <label>{t('expenses.description')}</label>
            <input value={description} onChange={e => setDescription(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
            <label>{t('expenses.amount')}</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
            <label>{t('payments.method')}</label>
            <select value={method} onChange={e => setMethod(e.target.value)} style={{ width: '100%', marginBottom: 10 }}>
              <option value="cash">{t('payments.methodCash')}</option>
              <option value="bank_transfer">{t('payments.methodBankTransfer')}</option>
              <option value="credit_card">{t('payments.methodCreditCard')}</option>
              <option value="standing_order">{t('payments.methodStandingOrder')}</option>
            </select>
          </>
        ) : (
          <>
            <label>{t('invoices.client')}</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
            <label>{t('invoices.itemDescription')}</label>
            <input value={itemDescription} onChange={e => setItemDescription(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
            <label>{t('recurringDocuments.monthlyAmount')}</label>
            <input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
          </>
        )}

        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
        <button type="button" disabled={saving || !canSubmit} onClick={submit} style={{ width: '100%' }}>
          {saving ? t('common.saving') : t('recurringDocuments.submit')}
        </button>
      </div>
    </div>
  );
}

export default function RecurringDocumentsPage() {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      setTemplates(await apiFetch<RecurringTemplate[]>('/recurring-documents'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load templates');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(tpl: RecurringTemplate) {
    try {
      await apiFetch(`/recurring-documents/${tpl.id}`, { method: 'PATCH', body: JSON.stringify({ active: !tpl.active }) });
      load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to update'); }
  }

  async function runNow(id: number) {
    try {
      await apiFetch(`/recurring-documents/${id}/run-now`, { method: 'POST' });
      load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to run'); }
  }

  async function remove(id: number, name: string) {
    if (!confirm(t('recurringDocuments.deleteConfirm', { name }))) return;
    try {
      await apiFetch(`/recurring-documents/${id}`, { method: 'DELETE' });
      load();
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to delete'); }
  }

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">{t('recurringDocuments.eyebrow')}</div>
          <h1>{t('recurringDocuments.title')}</h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => setShowCreate(true)}><Plus size={15} /> {t('recurringDocuments.newTemplate')}</button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border, #e5e5e5)' }}>
              <th style={{ padding: '8px 12px' }}>{t('recurringDocuments.templateName')}</th>
              <th style={{ padding: '8px 12px' }}>{t('recurringDocuments.documentType')}</th>
              <th style={{ padding: '8px 12px' }}>{t('recurringDocuments.dayOfMonth')}</th>
              <th style={{ padding: '8px 12px' }}>{t('recurringDocuments.nextRun')}</th>
              <th style={{ padding: '8px 12px' }}>{t('recurringDocuments.lastRun')}</th>
              <th style={{ padding: '8px 12px' }}>{t('recurringDocuments.status')}</th>
              <th style={{ padding: '8px 12px' }}></th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => (
              <tr key={tpl.id} style={{ borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                  <Repeat size={13} style={{ marginInlineEnd: 6, verticalAlign: 'middle', color: 'var(--ink-soft)' }} />
                  {tpl.name}
                </td>
                <td style={{ padding: '8px 12px' }}>{t(`recurringDocuments.type${tpl.documentType === 'expense' ? 'Expense' : 'Invoice'}`)}</td>
                <td style={{ padding: '8px 12px' }}>{tpl.dayOfMonth}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{tpl.nextRunDate}</td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--ink-soft)' }}>{tpl.lastRunDate ?? '—'}</td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: tpl.active ? '#d4edda' : '#e2e3e5',
                    color: tpl.active ? '#155724' : '#6c757d',
                  }}>
                    {tpl.active ? t('recurringDocuments.active') : t('recurringDocuments.paused')}
                  </span>
                </td>
                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                  <button className="ghost" title={t('recurringDocuments.runNow')} onClick={() => runNow(tpl.id)} style={{ marginRight: 4 }}><Play size={14} /></button>
                  <button className="ghost" title={tpl.active ? t('recurringDocuments.pause') : t('recurringDocuments.resume')} onClick={() => toggleActive(tpl)} style={{ marginRight: 4 }}>
                    {tpl.active ? <Pause size={14} /> : <PlayCircle size={14} />}
                  </button>
                  <button className="ghost" title={t('common.delete')} onClick={() => remove(tpl.id, tpl.name)} style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
            {templates.length === 0 && !loading && (
              <tr><td colSpan={7} style={{ padding: '16px 12px', color: 'var(--ink-soft)' }}>{t('recurringDocuments.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateTemplateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}
