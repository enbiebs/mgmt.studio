'use client'
// ──────────────────────────────────────────────────────────
//  RosterLegal — "All artists" → Legal: every contract across your artists in one list, with the date it ends.
//  Opening a row goes to that artist's own Legal page, on the tab that deals with it. Read-only: nothing is edited from here.
//  What each person sees (which artists, which numbers, where a row opens) is decided in lib/roster-legal.ts.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { today } from '@/lib/utils'
import {
  buildRosterLegal, defaultFilter, filterContracts, legalAccessFor, legalCapabilities, legalStats,
  type ContractRow, type LegalFilter,
} from '@/lib/roster-legal'
import { STATUS_CONFIG, TYPE_LABELS, fmt } from '@/components/legal/contract-labels'
import { useRosterClients } from '@/components/layout/nav'

const FILTERS: { key: LegalFilter; label: string }[] = [
  { key: 'attention', label: 'Needs attention' }, { key: 'progress', label: 'Being worked on' }, { key: 'signed', label: 'Signed' }, { key: 'all', label: 'Everything' },
]
// Worded about "the contracts you can see": someone sent a few contracts cannot say anything about the artist's whole file.
const EMPTY: Record<LegalFilter, string> = {
  attention: 'None of the contracts you can see needs attention.',
  progress: 'None of the contracts you can see is being drafted, reviewed or negotiated.',
  signed: 'None of the contracts you can see is signed.',
  all: 'No contracts.',
}
const PAGE = 150   // rows drawn at a time, so a long list stays quick

const SEGMENT = 'inline-flex flex-wrap p-0.5 bg-gray-100 rounded-lg text-xs font-medium'
const segment = (on: boolean) => `px-3 py-1 rounded-md transition-colors ${on ? 'bg-canvas shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`
const SELECT = 'px-2.5 py-1.5 text-xs bg-canvas border border-gray-200 rounded-lg text-gray-700 hover:border-gray-300 max-w-[180px]'
const DEMO_CHIP = 'text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 rounded-full px-1.5 flex-shrink-0'
const COLS = 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)_104px_minmax(0,1.3fr)]'

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'late' }) {
  return (
    <div className="glass bg-canvas border border-gray-100 rounded-2xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
      <div className={`font-serif text-xl font-semibold leading-tight mt-0.5 tabular-nums ${tone === 'late' ? 'text-red-700' : ''}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export function RosterLegal() {
  const roster = useRosterClients()
  const hasAccess = useStore(s => s.hasAccess)
  const isShareOnly = useStore(s => s.isShareOnly)
  const roleFor = useStore(s => s.roleFor)
  const openClient = useStore(s => s.openClient)
  const setSection = useStore(s => s.setSection)
  const setLegalSub = useStore(s => s.setLegalSub)
  const [chosen, setChosen] = useState<LegalFilter | undefined>(undefined)   // undefined until the person picks one
  const [clientId, setClientId] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const day = today()
  const inputs = roster.map(client => ({ client, access: legalAccessFor(hasAccess, isShareOnly, client.id, roleFor(client.id)) }))
  const caps = legalCapabilities(inputs.map(i => i.access))

  if (!caps.list) {
    return (
      <>
        <h1 className="font-serif text-[26px] font-medium leading-tight">Legal</h1>
        <p className="text-sm text-gray-400 mt-0.5">No artists with a legal page you can open yet.</p>
      </>
    )
  }

  const rows = buildRosterLegal(inputs, day)
  const stats = legalStats(rows)
  const filter = chosen ?? defaultFilter(caps.counts, stats)
  const people = [...new Map(rows.map(r => [r.clientId, r.clientName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const picked = people.some(([id]) => id === clientId) ? clientId : ''
  const shown = filterContracts(rows, { filter, clientId: picked || undefined })
  const drawn = shown.slice(0, limit)
  const partial = [...new Set(rows.filter(r => !r.full).map(r => r.clientName))]
  const reset = () => setLimit(PAGE)

  const open = (r: ContractRow) => { openClient(r.clientId); setSection('legal'); setLegalSub(r.sub) }

  return (
    <>
      <div className="mb-5">
        <h1 className="font-serif text-[26px] font-medium leading-tight">Legal</h1>
        <p className="text-sm text-gray-400 mt-0.5">Every contract across your artists, with the date it ends. Open one to go to that artist&apos;s contracts.</p>
      </div>

      {caps.counts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Stat label="Needs attention" value={String(stats.attention)} sub={stats.attention > 0 ? 'flagged, ending soon or ended' : 'all in good standing'} tone={stats.attention > 0 ? 'late' : undefined} />
          <Stat label="Ending soon" value={String(stats.expiring)} sub="within 90 days" />
          <Stat label="Already ended" value={String(stats.expired)} sub={stats.expired > 0 ? 'past the end date' : undefined} tone={stats.expired > 0 ? 'late' : undefined} />
          <Stat label="Being worked on" value={String(stats.inProgress)} sub="draft, review or negotiation" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div role="group" aria-label="Which contracts" className={SEGMENT}>
          {FILTERS.map(f => (
            <button key={f.key} aria-pressed={filter === f.key} onClick={() => { setChosen(f.key); reset() }} className={segment(filter === f.key)}>{f.label}</button>
          ))}
        </div>
        {people.length > 1 && (
          <select aria-label="Artist" value={picked} onChange={e => { setClientId(e.target.value); reset() }} className={SELECT}>
            <option value="">All artists</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">{rows.length === 0 ? 'No contracts yet. They show up here once they are added on an artist’s Legal page.' : EMPTY[filter]}</p>
      ) : (
        <div className="glass bg-canvas border border-gray-100 rounded-2xl overflow-hidden">
          <div className={`hidden lg:grid ${COLS} gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/60 text-[10px] font-bold uppercase tracking-widest text-gray-400`}>
            <span>Artist</span><span>Contract</span><span>Type</span><span>Status</span><span>Ends</span>
          </div>
          {drawn.map(r => {
            const st = STATUS_CONFIG[r.state]
            return (
              <button
                key={`${r.clientId}:${r.contractId}`}
                onClick={() => open(r)}
                className={`w-full text-left px-4 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors flex flex-wrap items-center gap-x-3 gap-y-1 lg:grid ${COLS}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.clientColor }} aria-hidden />
                  <span className="truncate text-sm font-medium">{r.clientName}</span>
                  {r.demo && <span className={DEMO_CHIP}>Demo</span>}
                </span>
                <span className="basis-full lg:basis-auto min-w-0 block">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate text-sm">{r.title}</span>
                    {r.flagged && <span className="text-red-500 flex-shrink-0" title="Flagged for review" aria-label="Flagged for review">⚑</span>}
                  </span>
                  <span className="block truncate text-xs text-gray-400">{r.counterparty}</span>
                </span>
                <span className="min-w-0 block">
                  <span className="block truncate text-xs text-gray-600">{TYPE_LABELS[r.type]}</span>
                  {r.value && <span className="block truncate text-xs text-gray-400 tabular-nums">{fmt(r.value.amount, r.value.currency)}</span>}
                </span>
                <span><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${st.bg} ${st.color}`}>{st.label}</span></span>
                <span className="basis-full lg:basis-auto min-w-0 block">
                  <span className={`block truncate text-xs ${r.state === 'expired' ? 'text-red-600 font-medium' : r.state === 'expiring' ? 'text-amber-700' : 'text-gray-500'}`}>{r.endLine ?? (r.live ? 'No end date' : '\u2014')}</span>
                  {r.noticeLine && <span className="block truncate text-xs font-medium text-amber-700">{r.noticeLine}</span>}
                </span>
              </button>
            )
          })}
          {shown.length > drawn.length && (
            <button onClick={() => setLimit(l => l + PAGE)} className="w-full px-4 py-2.5 text-xs font-medium text-accent hover:bg-gray-50 transition-colors">
              Show more ({shown.length - drawn.length} more)
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-1 text-xs text-gray-400">
        {partial.length > 0 && <p>{partial.join(', ')}: you were sent single contracts there, so only those are listed and nothing is added up from them.</p>}
        {caps.counts && rows.some(r => r.demo) && <p>Practice artists are listed with a Demo tag and are never counted in the numbers at the top.</p>}
      </div>
    </>
  )
}
