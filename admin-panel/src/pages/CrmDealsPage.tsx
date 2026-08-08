import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, Phone, Users, Mail, StickyNote } from 'lucide-react';
import { apiFetch } from '../services/api';

type DealStage = 'lead' | 'contacted' | 'negotiation' | 'won' | 'lost';
type InteractionType = 'call' | 'meeting' | 'email' | 'note';

interface Deal {
  id: number;
  clientName: string;
  clientPhone?: string;
  clientEmail?: string;
  stage: DealStage;
  estimatedValue?: number;
  description?: string;
  assignedTo?: { id: number; username: string };
  createdAt: string;
}
interface Interaction {
  id: number;
  type: InteractionType;
  text: string;
  createdAt: string;
  author: { id: number; username: string };
}

const STAGES: DealStage[] = ['lead', 'contacted', 'negotiation', 'won', 'lost'];
const STAGE_COLORS: Record<DealStage, string> = {
  lead: '#457B9D', contacted: '#8DB600', negotiation: '#F2701C', won: '#2E7D32', lost: '#C62828',
};
const INTERACTION_ICONS: Record<InteractionType, any> = { call: Phone, meeting: Users, email: Mail, note: StickyNote };

function CreateDealModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { t } = useTranslation();
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSaving(true); setError(null);
    try {
      await apiFetch('/crm/deals', {
        method: 'POST',
        body: JSON.stringify({
          clientName, clientPhone: clientPhone || undefined, clientEmail: clientEmail || undefined,
          estimatedValue: estimatedValue ? Number(estimatedValue) : undefined, description: description || undefined,
        }),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create deal');
    } finally { setSaving(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('crm.newDeal')}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>
        <label>{t('crm.clientName')}</label>
        <input value={clientName} onChange={(e) => setClientName(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('crm.clientPhone')}</label>
        <input value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('crm.clientEmail')}</label>
        <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('crm.estimatedValue')}</label>
        <input type="number" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        <label>{t('crm.description')}</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%', minHeight: 60, marginBottom: 14 }} />
        {error && <div className="error-banner" style={{ marginBottom: 10 }}>{error}</div>}
        <button type="button" disabled={saving || !clientName.trim()} onClick={submit} style={{ width: '100%' }}>
          {saving ? t('common.saving') : t('crm.submit')}
        </button>
      </div>
    </div>
  );
}

function DealDetailModal({ deal, onClose, onChanged }: { deal: Deal; onClose: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState<InteractionType>('call');
  const [newText, setNewText] = useState('');
  const [posting, setPosting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setInteractions(await apiFetch<Interaction[]>(`/crm/deals/${deal.id}/interactions`));
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [deal.id]);

  async function changeStage(stage: DealStage) {
    await apiFetch(`/crm/deals/${deal.id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage }) });
    onChanged();
  }

  async function addInteraction() {
    if (!newText.trim()) return;
    setPosting(true);
    try {
      await apiFetch(`/crm/deals/${deal.id}/interactions`, { method: 'POST', body: JSON.stringify({ type: newType, text: newText }) });
      setNewText('');
      load();
    } finally { setPosting(false); }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div className="card" style={{ width: 480, maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <h2 style={{ margin: 0 }}>{deal.clientName}</h2>
          <button className="ghost" onClick={onClose}><X size={16} /></button>
        </div>
        {deal.estimatedValue != null && <p style={{ margin: '0 0 10px', color: 'var(--ink-soft)' }}>₪{Number(deal.estimatedValue).toLocaleString()}</p>}
        {deal.description && <p style={{ fontSize: 13.5, marginBottom: 14 }}>{deal.description}</p>}

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {STAGES.map((s) => (
            <button
              key={s}
              type="button"
              className={s === deal.stage ? '' : 'ghost'}
              onClick={() => changeStage(s)}
              style={{ fontSize: 12, padding: '4px 10px', ...(s === deal.stage ? { background: STAGE_COLORS[s], borderColor: STAGE_COLORS[s] } : {}) }}
            >
              {t(`crm.stage_${s}`)}
            </button>
          ))}
        </div>

        <h3 style={{ fontSize: 14, marginBottom: 8 }}>{t('crm.interactions')}</h3>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <select value={newType} onChange={(e) => setNewType(e.target.value as InteractionType)} style={{ fontSize: 12.5 }}>
            <option value="call">{t('crm.typeCall')}</option>
            <option value="meeting">{t('crm.typeMeeting')}</option>
            <option value="email">{t('crm.typeEmail')}</option>
            <option value="note">{t('crm.typeNote')}</option>
          </select>
          <input value={newText} onChange={(e) => setNewText(e.target.value)} placeholder={t('crm.interactionPlaceholder')} style={{ flex: 1, fontSize: 12.5 }} />
          <button type="button" disabled={posting || !newText.trim()} onClick={addInteraction} style={{ fontSize: 12.5 }}>{t('crm.log')}</button>
        </div>

        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('common.loading')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {interactions.map((it) => {
              const Icon = INTERACTION_ICONS[it.type];
              return (
                <div key={it.id} style={{ display: 'flex', gap: 8, fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--border, #f0f0f0)' }}>
                  <Icon size={14} style={{ marginTop: 2, color: 'var(--ink-soft)', flexShrink: 0 }} />
                  <div>
                    <div>{it.text}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                      {it.author?.username} · {new Date(it.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
            {interactions.length === 0 && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{t('crm.noInteractions')}</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CrmDealsPage() {
  const { t } = useTranslation();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      setDeals(await apiFetch<Deal[]>('/crm/deals'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deals');
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="page">
      <div className="topbar">
        <div>
          <div className="eyebrow">{t('crm.eyebrow')}</div>
          <h1>{t('crm.title')}</h1>
        </div>
        <button type="button" onClick={() => setShowCreate(true)}><Plus size={15} /> {t('crm.newDeal')}</button>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 12 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
        {STAGES.map((stage) => {
          const stageDeals = deals.filter((d) => d.stage === stage);
          const total = stageDeals.reduce((s, d) => s + Number(d.estimatedValue ?? 0), 0);
          return (
            <div key={stage} style={{ minWidth: 240, flex: '0 0 240px' }}>
              <div style={{ padding: '8px 4px', borderBottom: `3px solid ${STAGE_COLORS[stage]}`, marginBottom: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{t(`crm.stage_${stage}`)} ({stageDeals.length})</div>
                {total > 0 && <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>₪{total.toLocaleString()}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stageDeals.map((deal) => (
                  <div
                    key={deal.id}
                    className="card"
                    style={{ padding: 10, cursor: 'pointer' }}
                    onClick={() => setSelectedDeal(deal)}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{deal.clientName}</div>
                    {deal.estimatedValue != null && <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>₪{Number(deal.estimatedValue).toLocaleString()}</div>}
                    {deal.assignedTo && <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 4 }}>{deal.assignedTo.username}</div>}
                  </div>
                ))}
                {stageDeals.length === 0 && !loading && (
                  <div style={{ fontSize: 12, color: 'var(--ink-soft)', padding: '8px 4px' }}>{t('crm.emptyStage')}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showCreate && <CreateDealModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      {selectedDeal && (
        <DealDetailModal
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onChanged={() => { load(); setSelectedDeal(null); }}
        />
      )}
    </div>
  );
}
