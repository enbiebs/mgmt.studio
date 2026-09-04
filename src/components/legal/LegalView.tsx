'use client'
// ──────────────────────────────────────────────────────────
//  LegalView — Contract pipeline, deadline alerts, rights register,
//  and shared document templates.
//  Contracts are still read-only — there's no add/edit UI for them yet.
//  Templates ARE editable (workspace-wide, gated by canEdit('legal')).
// ──────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import { uid } from '@/lib/utils'
import { extractPlaceholders, fillClauses, guessDefault, downloadRtf } from '@/lib/legal-doc-gen'
import type { Contract, ContractStatus, ContractType, LegalTemplate, LegalTemplateClause } from '@/types'

const STATUS_CONFIG: Record<ContractStatus, { label: string; color: string; bg: string; dot: string }> = {
  draft:       { label: 'Draft',       color: 'text-gray-500',   bg: 'bg-gray-100',   dot: 'bg-gray-400'   },
  review:      { label: 'In Review',   color: 'text-amber-700',  bg: 'bg-amber-50',   dot: 'bg-amber-400'  },
  negotiation: { label: 'Negotiating', color: 'text-purple-700', bg: 'bg-purple-50',  dot: 'bg-purple-400' },
  signed:      { label: 'Signed',      color: 'text-green-700',  bg: 'bg-green-50',   dot: 'bg-green-500'  },
  expired:     { label: 'Expired',     color: 'text-red-600',    bg: 'bg-red-50',     dot: 'bg-red-400'    },
  terminated:  { label: 'Terminated',  color: 'text-red-800',    bg: 'bg-red-100',    dot: 'bg-red-600'    },
}

const TYPE_ICONS: Record<ContractType, string> = {
  recording:  '🎙️',
  publishing: '✍️',
  sync:       '🎬',
  brand:      '🤝',
  touring:    '🎤',
  nda:        '🔒',
  merch:      '👕',
  other:      '📄',
}

const TYPE_LABELS: Record<ContractType, string> = {
  recording:  'Recording',
  publishing: 'Publishing',
  sync:       'Sync License',
  brand:      'Brand / Endorsement',
  touring:    'Touring / Agency',
  nda:        'NDA',
  merch:      'Merchandise',
  other:      'Other',
}

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(iso: string): number {
  const d = new Date(iso + 'T00:00:00')
  const now = new Date()
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

type LawyerTab = 'pipeline' | 'alerts' | 'register' | 'templates'

const ACTIVE_STATUSES: ContractStatus[] = ['draft', 'review', 'negotiation', 'signed']

export function LegalView() {
  const client = useStore(s => s.getClient())
  const [tab, setTab] = useState<LawyerTab>('pipeline')
  const [filterType, setFilterType] = useState<ContractType | 'all'>('all')

  if (!client) return null
  const contracts = client.legal?.contracts ?? []

  const active    = contracts.filter(c => ACTIVE_STATUSES.includes(c.status))
  const flagged   = contracts.filter(c => c.flagged)
  const expiring  = contracts.filter(c => c.expiryDate && c.status === 'signed' && daysUntil(c.expiryDate) <= 90 && daysUntil(c.expiryDate) > 0)
  const expired   = contracts.filter(c => c.expiryDate && daysUntil(c.expiryDate) < 0 && c.status !== 'terminated')
  const pending   = contracts.filter(c => c.status === 'draft' || c.status === 'review' || c.status === 'negotiation')

  const types = Array.from(new Set(contracts.map(c => c.type))) as ContractType[]

  const filtered = filterType === 'all' ? contracts : contracts.filter(c => c.type === filterType)

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100">
        <div className="flex items-end justify-between mb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Legal</div>
            <h2 className="text-xl font-semibold">{client.name} — Contracts</h2>
          </div>
          <div className="flex gap-3">
            <StatPill label="Total contracts" value={String(contracts.length)} color="text-gray-700" />
            <StatPill label="Pending action" value={String(pending.length)} color="text-amber-700" />
            {flagged.length > 0 && <StatPill label="Flagged" value={String(flagged.length)} color="text-red-600" />}
          </div>
        </div>
        <div className="flex gap-0.5">
          {([['pipeline', 'Contract Pipeline'], ['alerts', `Alerts${flagged.length + expiring.length + expired.length > 0 ? ` (${flagged.length + expiring.length + expired.length})` : ''}`], ['register', 'Rights Register'], ['templates', 'Templates']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-gray-900 text-canvas' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {tab === 'pipeline'  && <PipelineTab contracts={contracts} />}
        {tab === 'alerts'    && <AlertsTab flagged={flagged} expiring={expiring} expired={expired} />}
        {tab === 'register'  && <RegisterTab contracts={contracts} types={types} filterType={filterType} setFilterType={setFilterType} filtered={filtered} />}
        {tab === 'templates' && <TemplatesTab />}
      </div>
    </div>
  )
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-right">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-400 uppercase tracking-wide">{label}</div>
    </div>
  )
}

// ── Pipeline ────────────────────────────────────────────────
function PipelineTab({ contracts }: { contracts: Contract[] }) {
  const STAGES: ContractStatus[] = ['draft', 'review', 'negotiation', 'signed']

  return (
    <div className="space-y-2">
      {/* Column headers */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {STAGES.map(s => {
          const cfg = STATUS_CONFIG[s]
          const items = contracts.filter(c => c.status === s)
          return (
            <div key={s} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">{cfg.label}</span>
              </div>
              <span className="text-xs text-gray-300">{items.length}</span>
            </div>
          )
        })}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {STAGES.map(s => {
          const items = contracts.filter(c => c.status === s)
          return (
            <div key={s} className="space-y-2">
              {items.length === 0 && (
                <div className="border-2 border-dashed border-gray-100 rounded-xl p-6 text-center text-xs text-gray-300">—</div>
              )}
              {items.map(c => <ContractCard key={c.id} contract={c} />)}
            </div>
          )
        })}
      </div>

      {/* Terminated / expired at bottom */}
      {contracts.filter(c => c.status === 'expired' || c.status === 'terminated').length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-100">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Closed</div>
          <div className="space-y-2">
            {contracts.filter(c => c.status === 'expired' || c.status === 'terminated').map(c => (
              <ContractRow key={c.id} contract={c} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ContractCard({ contract: c }: { contract: Contract }) {
  const cfg = STATUS_CONFIG[c.status]
  return (
    <div className={`border rounded-xl p-3 ${c.flagged ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-canvas'} hover:shadow-sm transition-shadow`}>
      <div className="flex items-start gap-1.5 mb-1">
        <span className="text-base">{TYPE_ICONS[c.type]}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-xs leading-snug">{c.title}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">{c.counterparty}</div>
        </div>
        {c.flagged && <span className="text-red-500 flex-shrink-0">⚑</span>}
      </div>
      <div className="flex flex-wrap gap-1 mt-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{TYPE_LABELS[c.type]}</span>
        {c.value ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{fmt(c.value, c.currency)}</span> : null}
      </div>
      {c.expiryDate && (
        <div className={`mt-2 text-[10px] ${daysUntil(c.expiryDate) < 90 ? 'text-amber-600' : 'text-gray-400'}`}>
          Expires {fmtDate(c.expiryDate)}
        </div>
      )}
      {c.notes && <div className="mt-2 text-[10px] text-gray-400 italic line-clamp-2">{c.notes}</div>}
    </div>
  )
}

function ContractRow({ contract: c }: { contract: Contract }) {
  const cfg = STATUS_CONFIG[c.status]
  return (
    <div className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl opacity-60">
      <span className="text-sm">{TYPE_ICONS[c.type]}</span>
      <div className="flex-1">
        <div className="text-sm font-medium">{c.title}</div>
        <div className="text-xs text-gray-400">{c.counterparty}</div>
      </div>
      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
    </div>
  )
}

// ── Alerts ──────────────────────────────────────────────────
function AlertsTab({ flagged, expiring, expired }: { flagged: Contract[]; expiring: Contract[]; expired: Contract[] }) {
  if (flagged.length === 0 && expiring.length === 0 && expired.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <div className="text-3xl mb-2">✓</div>
        <div className="text-sm">No alerts — all contracts in good standing</div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8">
      {flagged.length > 0 && (
        <AlertSection
          title="Flagged for Review"
          icon="⚑"
          color="text-red-600"
          contracts={flagged}
          getNote={c => c.notes}
        />
      )}
      {expired.length > 0 && (
        <AlertSection
          title="Expired (Action Required)"
          icon="⏰"
          color="text-red-500"
          contracts={expired}
          getNote={c => c.expiryDate ? `Expired ${fmtDate(c.expiryDate)}` : undefined}
        />
      )}
      {expiring.length > 0 && (
        <AlertSection
          title="Expiring Within 90 Days"
          icon="⚠️"
          color="text-amber-600"
          contracts={expiring}
          getNote={c => c.expiryDate ? `Expires ${fmtDate(c.expiryDate)} (${daysUntil(c.expiryDate)} days)` : undefined}
        />
      )}
    </div>
  )
}

function AlertSection({ title, icon, color, contracts, getNote }: {
  title: string; icon: string; color: string;
  contracts: Contract[]; getNote: (c: Contract) => string | undefined
}) {
  return (
    <div>
      <div className={`text-[10px] font-bold uppercase tracking-widest mb-3 ${color}`}>{icon} {title}</div>
      <div className="space-y-2">
        {contracts.map(c => (
          <div key={c.id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50">
            <div className="flex items-start gap-3">
              <span className="text-lg">{TYPE_ICONS[c.type]}</span>
              <div className="flex-1">
                <div className="font-semibold text-sm">{c.title}</div>
                <div className="text-xs text-gray-400 mt-0.5">{c.counterparty} · {TYPE_LABELS[c.type]}</div>
                {getNote(c) && <div className={`mt-2 text-xs ${color}`}>{getNote(c)}</div>}
              </div>
              <StatusBadge status={c.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Rights Register ─────────────────────────────────────────
function RegisterTab({ contracts, types, filterType, setFilterType, filtered }: {
  contracts: Contract[]
  types: ContractType[]
  filterType: ContractType | 'all'
  setFilterType: (t: ContractType | 'all') => void
  filtered: Contract[]
}) {
  const sortedFiltered = [...filtered].sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title))

  return (
    <div className="max-w-3xl">
      {/* Type filter */}
      <div className="flex flex-wrap gap-1 mb-4">
        <button
          onClick={() => setFilterType('all')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterType === 'all' ? 'bg-gray-900 text-canvas' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          All ({contracts.length})
        </button>
        {types.map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterType === t ? 'bg-gray-900 text-canvas' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
          >
            {TYPE_ICONS[t]} {TYPE_LABELS[t]} ({contracts.filter(c => c.type === t).length})
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="border border-gray-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Contract</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Type</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Counterparty</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Value</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Expiry</th>
              <th className="text-left px-4 py-2 text-xs text-gray-400 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {sortedFiltered.map(c => {
              const daysLeft = c.expiryDate ? daysUntil(c.expiryDate) : null
              return (
                <tr key={c.id} className={`hover:bg-gray-50 ${c.flagged ? 'bg-red-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {c.flagged && <span className="text-red-500 text-xs">⚑</span>}
                      <span className="font-medium text-sm">{c.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{TYPE_ICONS[c.type]} {TYPE_LABELS[c.type]}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{c.counterparty}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">
                    {c.value ? fmt(c.value, c.currency) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {c.expiryDate ? (
                      <span className={daysLeft !== null && daysLeft < 90 && daysLeft > 0 ? 'text-amber-600 font-medium' : daysLeft !== null && daysLeft < 0 ? 'text-red-500 font-medium' : 'text-gray-500'}>
                        {fmtDate(c.expiryDate)}
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Templates ───────────────────────────────────────────────
function TemplatesTab() {
  const editable = useStore(s => s.canEdit('legal'))
  const templates = useStore(s => s.legalTemplates)
  const [openId, setOpenId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const [generateId, setGenerateId] = useState<string | null>(null)
  const open = templates.find(t => t.id === openId)
  const generating = templates.find(t => t.id === generateId)

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div className="text-xs text-gray-400 leading-relaxed">
          Reusable document language shared across every client — edit any clause below to match how you actually want it worded, or fill one in for a specific deal.
        </div>
        {editable && (
          <button
            onClick={() => setAddOpen(true)}
            className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors flex-shrink-0"
          >
            + New template
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {templates.map(t => (
          <div
            key={t.id}
            className="border border-gray-100 rounded-xl px-4 py-3 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors"
          >
            <div className="min-w-0 cursor-pointer" onClick={() => setOpenId(t.id)}>
              <div className="text-sm font-medium">{t.name}</div>
              {t.description && <div className="text-xs text-gray-400 mt-0.5">{t.description}</div>}
              <div className="text-[11px] text-gray-300 mt-1">
                {t.clauses.length} {t.clauses.length === 1 ? 'clause' : 'clauses'}
              </div>
            </div>
            <button
              onClick={() => setGenerateId(t.id)}
              disabled={t.clauses.length === 0}
              className="px-2.5 py-1 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors flex-shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Generate →
            </button>
          </div>
        ))}
        {templates.length === 0 && (
          <div className="text-sm text-gray-300 text-center py-12">No templates yet</div>
        )}
      </div>

      {open && <TemplateModal template={open} onClose={() => setOpenId(null)} />}
      {addOpen && <NewTemplateModal onClose={() => setAddOpen(false)} />}
      {generating && <GenerateDocumentModal template={generating} onClose={() => setGenerateId(null)} />}
    </div>
  )
}

function NewTemplateModal({ onClose }: { onClose: () => void }) {
  const { addLegalTemplate } = useStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  function handleCreate() {
    if (!name.trim()) return
    addLegalTemplate(name.trim(), description.trim() || undefined)
    onClose()
  }

  return (
    <Modal title="New template" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleCreate} disabled={!name.trim()} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-40">
          Create
        </button>
      </>
    }>
      <FormField label="Name">
        <input className={inputClass} placeholder="e.g. Merch Licensing Agreement" value={name} onChange={e => setName(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Description">
        <input className={inputClass} placeholder="Optional" value={description} onChange={e => setDescription(e.target.value)} />
      </FormField>
    </Modal>
  )
}

// A dedicated wide, scrollable panel rather than the shared 460px Modal —
// editing a 10+ clause document needs real room, unlike every other
// short-form modal in the app.
function TemplateModal({ template, onClose }: { template: LegalTemplate; onClose: () => void }) {
  const editable = useStore(s => s.canEdit('legal'))
  const { updateLegalTemplate, deleteLegalTemplate } = useStore()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description ?? '')
  const [clauses, setClauses] = useState<LegalTemplateClause[]>(template.clauses)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateClause(id: string, patch: Partial<LegalTemplateClause>) {
    setClauses(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
  }
  function removeClause(id: string) {
    setClauses(cs => cs.filter(c => c.id !== id))
  }
  function addClause() {
    setClauses(cs => [...cs, { id: 'clause-' + uid(), title: 'New clause', body: '' }])
  }
  function handleSave() {
    updateLegalTemplate(template.id, {
      name: name.trim() || template.name,
      description: description.trim() || undefined,
      clauses,
    })
    onClose()
  }
  function handleDelete() {
    if (!confirm(`Delete the "${template.name}" template? This can't be undone.`)) return
    deleteLegalTemplate(template.id)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-canvas rounded-2xl shadow-2xl w-[720px] max-w-[92vw] max-h-[86vh] flex flex-col animate-in slide-in-from-bottom-3 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex-1 min-w-0">
            {editable ? (
              <input
                className="font-serif text-lg font-medium w-full outline-none bg-transparent"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            ) : (
              <div className="font-serif text-lg font-medium">{name}</div>
            )}
            {editable ? (
              <input
                className="text-xs text-gray-400 w-full outline-none bg-transparent mt-1"
                placeholder="Description (optional)"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            ) : description ? (
              <div className="text-xs text-gray-400 mt-1">{description}</div>
            ) : null}
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 flex-shrink-0 text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {clauses.map(c => (
            <div key={c.id} className="group">
              <div className="flex items-center gap-2 mb-1.5">
                {editable ? (
                  <input
                    className="text-xs font-semibold text-gray-600 flex-1 outline-none bg-transparent"
                    value={c.title}
                    onChange={e => updateClause(c.id, { title: e.target.value })}
                  />
                ) : (
                  <div className="text-xs font-semibold text-gray-600 flex-1">{c.title}</div>
                )}
                {editable && (
                  <button
                    onClick={() => removeClause(c.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-400 text-xs flex-shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
              {editable ? (
                <textarea
                  className={inputClass}
                  rows={Math.min(10, Math.max(3, Math.ceil(c.body.length / 90)))}
                  value={c.body}
                  onChange={e => updateClause(c.id, { body: e.target.value })}
                />
              ) : (
                <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{c.body}</div>
              )}
            </div>
          ))}
          {clauses.length === 0 && (
            <div className="text-sm text-gray-300 text-center py-8">No clauses yet</div>
          )}
          {editable && (
            <button onClick={addClause} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
              + Add clause
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          {editable && (
            <button onClick={handleDelete} className="px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50 mr-auto">
              Delete template
            </button>
          )}
          {editable ? (
            <>
              <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Save</button>
            </>
          ) : (
            <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 ml-auto">Close</button>
          )}
        </div>
      </div>
    </div>
  )
}

function placeholderLabel(p: string): string {
  return p.trim().toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase())
}

function assembleText(templateName: string, clauses: LegalTemplateClause[]): string {
  return `${templateName.toUpperCase()}\n\n${clauses.map(c => `${c.title}\n\n${c.body}`).join('\n\n\n')}`
}

// Fills a template's [BRACKETED] placeholders in one pass, then shows the
// finished document before it ever leaves the browser — Peak-End: the last
// thing someone sees should be the actual result, not a black-box download.
function GenerateDocumentModal({ template, onClose }: { template: LegalTemplate; onClose: () => void }) {
  const client = useStore(s => s.getClient())
  const [step, setStep] = useState<'fill' | 'preview'>('fill')
  const [copied, setCopied] = useState(false)
  const placeholders = extractPlaceholders(template.clauses)
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const p of placeholders) initial[p] = guessDefault(p, client?.name ?? '')
    return initial
  })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filledClauses = fillClauses(template.clauses, values)
  const blanks = placeholders.filter(p => !values[p]?.trim())

  function handleCopy() {
    navigator.clipboard.writeText(assembleText(template.name, filledClauses)).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleDownload() {
    downloadRtf(template.name.replace(/[^\w -]/g, ''), template.name, filledClauses)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-canvas rounded-2xl shadow-2xl w-[720px] max-w-[92vw] max-h-[86vh] flex flex-col animate-in slide-in-from-bottom-3 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <div className="font-serif text-lg font-medium">{template.name}</div>
            <div className="text-xs text-gray-400 mt-1">
              {step === 'fill' ? 'Fill in the blanks, then generate the document.' : 'Ready — copy it or download a Word-compatible file.'}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 flex-shrink-0 text-lg leading-none">✕</button>
        </div>

        {step === 'fill' ? (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {placeholders.length === 0 && (
                <div className="text-sm text-gray-300 text-center py-8">This template has no fill-in blanks — it&apos;s ready to generate as-is.</div>
              )}
              {placeholders.map(p => (
                <FormField key={p} label={placeholderLabel(p)}>
                  <input
                    className={inputClass}
                    value={values[p] ?? ''}
                    onChange={e => setValues(v => ({ ...v, [p]: e.target.value }))}
                  />
                </FormField>
              ))}
            </div>
            <div className="flex items-center gap-3 px-6 py-4 border-t border-gray-100 flex-shrink-0">
              {blanks.length > 0 && (
                <span className="text-[11px] text-gray-400">
                  {blanks.length} left blank — {blanks.length === 1 ? 'it will' : 'they will'} stay as [bracketed text] in the document
                </span>
              )}
              <button onClick={() => setStep('preview')} className="ml-auto px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">
                Generate document
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{assembleText(template.name, filledClauses)}</pre>
            </div>
            <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
              <button onClick={() => setStep('fill')} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">← Edit fields</button>
              <button onClick={handleCopy} className="ml-auto px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">
                {copied ? 'Copied ✓' : 'Copy text'}
              </button>
              <button onClick={handleDownload} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">
                Download (.rtf)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: ContractStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}
