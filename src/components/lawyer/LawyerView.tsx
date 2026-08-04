'use client'
// ──────────────────────────────────────────────────────────
//  LawyerView — Entertainment attorney portal
//  Shows: contract pipeline, deadline alerts, rights register
//  Hides: financials, fan data, internal ops
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import type { Contract, ContractStatus, ContractType } from '@/types'

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

type LawyerTab = 'pipeline' | 'alerts' | 'register'

const ACTIVE_STATUSES: ContractStatus[] = ['draft', 'review', 'negotiation', 'signed']

export function LawyerView() {
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
          {([['pipeline', 'Contract Pipeline'], ['alerts', `Alerts${flagged.length + expiring.length + expired.length > 0 ? ` (${flagged.length + expiring.length + expired.length})` : ''}`], ['register', 'Rights Register']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
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
    <div className={`border rounded-xl p-3 ${c.flagged ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-white'} hover:shadow-sm transition-shadow`}>
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
          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterType === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          All ({contracts.length})
        </button>
        {types.map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${filterType === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
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

function StatusBadge({ status }: { status: ContractStatus }) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  )
}
