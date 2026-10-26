'use client'
// ──────────────────────────────────────────────────────────
//  RosterFinance — "All artists" → Finance: the money coming in and going out, across your artists, in one list.
//  Opening a line goes to that artist's own page (the invoice, the bill, the settlement or the show). Read-only here:
//  nothing is edited from this page. Who is counted, and where a line opens, is decided in lib/roster-finance.ts.
//  A person who works for several companies sees one company's money at a time (money is never added across companies).
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { today } from '@/lib/utils'
import { fmtAmount } from '@/lib/forecast'
import { dayWord, plural, whenWord } from '@/lib/roster-summary'
import { buildRosterFinance, filterFinance, financeAccessFor, financeStats, scopeToCompany, type FinanceInput, type FinanceRow, type FinanceWindow } from '@/lib/roster-finance'
import type { BizSub, TourSub } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { useRosterClients } from '@/components/layout/nav'

const WINDOWS: { key: FinanceWindow; label: string }[] = [
  { key: 'late', label: 'Late' }, { key: '30', label: 'Next 30 days' }, { key: '90', label: 'Next 90 days' }, { key: 'all', label: 'Everything' },
]
const PAGE = 150   // rows drawn at a time, so a long list stays quick

const SEGMENT = 'inline-flex p-0.5 bg-gray-100 rounded-lg text-xs font-medium'
const segment = (on: boolean) => `px-3 py-1 rounded-md transition-colors ${on ? 'bg-canvas shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`
const SELECT = 'px-2.5 py-1.5 text-xs bg-canvas border border-gray-200 rounded-lg text-gray-700 hover:border-gray-300 max-w-[180px]'
const DEMO_CHIP = 'text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 rounded-full px-1.5 flex-shrink-0'

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'late' }) {
  return (
    <div className="glass bg-canvas border border-gray-100 rounded-2xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
      <div className={`font-serif text-xl font-semibold leading-tight mt-0.5 tabular-nums ${tone === 'late' ? 'text-red-700' : ''}`}>{value || '—'}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

// "Nov 3", or "Nov 3, 2027" when it is not this year (the list can reach back and forward a long way).
const dateWord = (iso: string, now: string) => (iso.slice(0, 4) === now.slice(0, 4) ? dayWord(iso) : `${dayWord(iso)}, ${iso.slice(0, 4)}`)

const EMPTY: Record<FinanceWindow, { in: string; out: string }> = {
  late: { in: 'Nothing is late. Everything that was expected has been recorded.', out: 'No bill is overdue.' },
  '30': { in: 'Nothing is expected in the next 30 days.', out: 'No bill is due in the next 30 days.' },
  '90': { in: 'Nothing is expected in the next 90 days.', out: 'No bill is due in the next 90 days.' },
  all: { in: 'Nothing is expected to come in.', out: 'No unpaid bills.' },
}

export function RosterFinance() {
  const roster = useRosterClients()
  const hasAccess = useStore(s => s.hasAccess)
  const isShareOnly = useStore(s => s.isShareOnly)
  const roleFor = useStore(s => s.roleFor)
  const clientWorkspace = useStore(s => s.clientWorkspace)
  const workspaceId = useStore(s => s.workspaceId)
  const contexts = useStore(s => s.contexts)
  const companyName = useStore(s => s.companyName)
  const openClient = useStore(s => s.openClient)
  const setSection = useStore(s => s.setSection)
  const setBizSub = useStore(s => s.setBizSub)
  const setTourSub = useStore(s => s.setTourSub)
  const setSelectedShow = useStore(s => s.setSelectedShow)
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [when, setWhen] = useState<FinanceWindow>('30')
  const [clientId, setClientId] = useState('')
  const [chosenCompany, setChosenCompany] = useState<string | null | undefined>(undefined)   // undefined until the person picks one
  const [limit, setLimit] = useState(PAGE)

  const day = today()
  const inputs: FinanceInput[] = roster.map(client => ({
    client,
    access: financeAccessFor(hasAccess, isShareOnly, client.id, roleFor(client.id)),
    workspaceId: clientWorkspace[client.id] ?? workspaceId ?? null,
  }))

  // One company's money at a time; the company picker shows only when there is more than one to pick.
  const { companies, company, scoped } = scopeToCompany(inputs, chosenCompany, workspaceId ?? null)
  const nameOf = (ws: string | null) => (ws && contexts[ws]?.companyName) || companyName || 'Your company'

  const { rows, undated, limitedNames, noShowMoneyNames } = buildRosterFinance(scoped, day)

  if (companies.length === 0) {
    return (
      <>
        <h1 className="font-serif text-[26px] font-medium leading-tight">Finance</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {limitedNames.length > 0
            ? `You were sent single items for ${limitedNames.join(', ')}, which is not enough to add up. Open an artist from the switcher at the top left to see what was shared.`
            : 'No artists with a finance page you can open yet.'}
        </p>
      </>
    )
  }

  const stats = financeStats(rows, day)
  const people = [...new Map(rows.map(r => [r.clientId, r.clientName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const picked = people.some(([id]) => id === clientId) ? clientId : ''
  const shown = filterFinance(rows, { direction, window: when, clientId: picked || undefined }, day)
  const drawn = shown.slice(0, limit)
  const reset = () => setLimit(PAGE)

  const open = (r: FinanceRow) => {
    openClient(r.clientId)
    if (r.link.section === 'tour') {
      setSection('tour'); setTourSub(r.link.sub as TourSub)
      if (r.showId) setSelectedShow(r.showId)   // (setSection() clears the selected show, so it runs first)
    } else {
      setSection('finance'); setBizSub(r.link.sub as BizSub)
    }
  }

  return (
    <>
      <div className="mb-5">
        <h1 className="font-serif text-[26px] font-medium leading-tight">Finance</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Money coming in and going out across your artists. Open a line to go to that artist&apos;s page.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="Late to come in" value={stats.lateIn} sub={stats.lateInCount > 0 ? plural(stats.lateInCount, 'item') : 'nothing late'} tone={stats.lateInCount > 0 ? 'late' : undefined} />
        <Stat label="Late to pay out" value={stats.lateOut} sub={stats.lateOutCount > 0 ? plural(stats.lateOutCount, 'bill') : 'nothing overdue'} tone={stats.lateOutCount > 0 ? 'late' : undefined} />
        <Stat label="Coming in" value={stats.in30} sub="next 30 days" />
        <Stat label="Going out" value={stats.out30} sub="next 30 days" />
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div role="group" aria-label="Which way" className={SEGMENT}>
          <button aria-pressed={direction === 'in'} onClick={() => { setDirection('in'); reset() }} className={segment(direction === 'in')}>Coming in</button>
          <button aria-pressed={direction === 'out'} onClick={() => { setDirection('out'); reset() }} className={segment(direction === 'out')}>Going out</button>
        </div>
        <div role="group" aria-label="When" className={SEGMENT}>
          {WINDOWS.map(w => (
            <button key={w.key} aria-pressed={when === w.key} onClick={() => { setWhen(w.key); reset() }} className={segment(when === w.key)}>{w.label}</button>
          ))}
        </div>
        {people.length > 1 && (
          <select aria-label="Artist" value={picked} onChange={e => { setClientId(e.target.value); reset() }} className={SELECT}>
            <option value="">All artists</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
        {companies.length > 1 && (
          <select aria-label="Company" value={company ?? ''} onChange={e => { setChosenCompany(e.target.value || null); setClientId(''); reset() }} className={SELECT}>
            {companies.map(ws => <option key={ws ?? ''} value={ws ?? ''}>{nameOf(ws)}</option>)}
          </select>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">{rows.length === 0 ? 'No money is expected yet. Invoices, bills and settlements will show up here.' : EMPTY[when][direction]}</p>
      ) : (
        <div className="glass bg-canvas border border-gray-100 rounded-2xl overflow-hidden">
          <div className="hidden lg:grid lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,2fr)_120px] gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/60 text-[10px] font-bold uppercase tracking-widest text-gray-400">
            <span>Expected</span><span>Artist</span><span>What</span><span className="text-right">Amount</span>
          </div>
          {drawn.map(r => (
            <button
              key={`${r.clientId}:${r.id}`}
              onClick={() => open(r)}
              className="w-full text-left px-4 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors flex flex-wrap items-center gap-x-3 gap-y-1 lg:grid lg:grid-cols-[120px_minmax(0,1fr)_minmax(0,2fr)_120px]"
            >
              <span className="flex items-baseline gap-2 lg:block">
                <span className="text-sm font-semibold tabular-nums">{dateWord(r.date, day)}</span>
                <span className={`text-xs lg:block ${r.late ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{r.late ? `${plural(r.daysLate, 'day')} late` : whenWord(r.date, day)}</span>
              </span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.clientColor }} aria-hidden />
                <span className="truncate text-sm font-medium">{r.clientName}</span>
                {r.demo && <span className={DEMO_CHIP}>Demo</span>}
              </span>
              <span className="basis-full lg:basis-auto min-w-0 block">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-sm">{r.title}</span>
                  {r.estimated && <Badge variant="gray">Estimated date</Badge>}
                </span>
                {r.detail && <span className="block truncate text-xs text-gray-400">{r.detail}</span>}
              </span>
              <span className={`ml-auto text-sm font-semibold tabular-nums lg:ml-0 lg:text-right ${r.direction === 'in' ? 'text-green-700' : 'text-gray-700'}`}>{fmtAmount(r.amount, r.currency)}</span>
            </button>
          ))}
          {shown.length > drawn.length && (
            <button onClick={() => setLimit(l => l + PAGE)} className="w-full px-4 py-2.5 text-xs font-medium text-accent hover:bg-gray-50 transition-colors">
              Show more ({shown.length - drawn.length} more)
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-1 text-xs text-gray-400">
        {undated.count > 0 && <p>{plural(undated.count, 'unpaid bill')} {undated.count === 1 ? 'has' : 'have'} no due date, so {undated.count === 1 ? 'it is' : 'they are'} not listed here ({undated.byCurrency}). Give {undated.count === 1 ? 'it' : 'them'} a date on the artist&apos;s Payments page.</p>}
        {noShowMoneyNames.length > 0 && <p>Settlements and show fees are not included for {noShowMoneyNames.join(', ')}: they need access to that artist&apos;s Tour and Deals &amp; fees as well. Invoices and bills are.</p>}
        {limitedNames.length > 0 && <p>Not counted: {limitedNames.join(', ')}. You were sent single items there, which is not enough to add up.</p>}
        {rows.some(r => r.demo) && <p>Practice artists are listed with a Demo tag and are never counted in the numbers at the top.</p>}
      </div>
    </>
  )
}
