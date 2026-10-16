'use client'
// ──────────────────────────────────────────────────────────
//  BudgetAssumptions — the panel at the top of a budget that makes it easy to build. A few plain assumptions (who
//  travels, from where, which nights) plus an estimate for flights, hotels and ground work the travel lines out. An
//  estimate comes from the artist's own past trips or a web search (always labelled an estimate, with its sources),
//  anything the promoter covers is taken off the cost, and each row can open a search with the trip already filled in
//  and add a to-do to book it. Nothing here books or pays for anything.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { inputClass } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { NumInput } from './budget-inputs'
import {
  TRAVEL_BUCKET, TRAVEL_KINDS, TRAVEL_LABEL, TRAVEL_UNIT, applyTravelLines, assumptionsSummary, computeTravelLines, currencyFormatter,
  defaultAssumptions, nightsBetween, promoterCovers, type TravelKind, type TravelLine,
} from '@/lib/budget-assumptions'
import { bookingLinks, bookingTodo, historyEstimate, type HistoryEstimate } from '@/lib/travel-estimates'
import { requestWebEstimate } from '@/lib/travel-estimate-client'
import { makeConverter } from '@/lib/budget'
import { today } from '@/lib/utils'
import type { Budget, BudgetAssumptions, BudgetBucket, BudgetEstimate, Client, Show, TourOffer } from '@/types'

// A text box that saves when you tab or click away (so typing a city does not save every letter), and can be emptied.
function DraftField({ label, value, onCommit, disabled, placeholder }: { label: string; value: string; onCommit: (v: string) => void; disabled?: boolean; placeholder?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
      <input
        type="text" className={inputClass} value={draft ?? value} disabled={disabled} placeholder={placeholder} maxLength={80}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (draft !== null && draft.trim() !== value) onCommit(draft.trim()); setDraft(null) }}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      />
    </label>
  )
}

function CountField({ label, value, onCommit, disabled }: { label: string; value: number; onCommit: (n: number) => void; disabled?: boolean }) {
  return (
    <div className="block">
      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
      <NumInput value={value} disabled={disabled} onCommit={n => onCommit(Math.min(40, Math.max(1, Math.round(n))))} className="!text-left" />
    </div>
  )
}

const SOURCE_LABEL = { typed: 'Typed by you', history: 'Your past trips', web: 'Web estimate' } as const

function EstimateRow({ kind, cur, est, line, skipped, history, links, busy, editable, canSearch, searchHint, onAmount, onHistory, onWeb, onClear, onForce, onTodo }: {
  kind: TravelKind; cur: string; est?: BudgetEstimate; line?: TravelLine; skipped: boolean; history: HistoryEstimate | null
  links: { label: string; url: string }[]; busy: boolean; editable: boolean; canSearch: boolean; searchHint: string
  onAmount: (n: number) => void; onHistory: () => void; onWeb: () => void; onClear: () => void; onForce: () => void; onTodo: () => void
}) {
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(Math.round(n))
  return (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          <div className="text-sm font-medium">{TRAVEL_LABEL[kind]}</div>
          <div className="text-[11px] text-gray-400">{TRAVEL_UNIT[kind]}</div>
        </div>
        <div className="w-28 flex-shrink-0"><NumInput value={est?.amount ?? 0} disabled={!editable || busy} onCommit={onAmount} /></div>
        {editable && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium">
            {history && <button onClick={onHistory} disabled={busy} className="text-accent hover:underline disabled:opacity-50" title={history.note}>From my past trips</button>}
            <button onClick={onWeb} disabled={busy || !canSearch} title={canSearch ? 'Searches the web for current prices (a few cents each time)' : searchHint} className="text-accent hover:underline disabled:text-gray-300 disabled:no-underline">
              {busy ? 'Searching…' : 'Search the web'}
            </button>
            {est && <button onClick={onClear} disabled={busy} className="text-gray-400 hover:text-red-500 disabled:opacity-50">Clear</button>}
          </div>
        )}
      </div>

      {est && est.source !== 'typed' && (
        <div className="mt-2 text-[11px] text-gray-500">
          <Badge variant={est.source === 'web' ? 'blue' : 'green'}>{SOURCE_LABEL[est.source]}{est.asOf ? ` · ${new Date(est.asOf + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</Badge>
          {est.low != null && est.high != null && <span className="ml-2">usually {fmt(est.low)}–{fmt(est.high)}</span>}
          <span className="ml-2">{est.source === 'web' ? 'An estimate, not a quote.' : ''}</span>
          {est.note && <p className="mt-1">{est.note}</p>}
          {est.sources && est.sources.length > 0 && (
            <p className="mt-1">Looked at: {est.sources.map((s, i) => (
              <span key={s.url}>{i > 0 && ' · '}<a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{s.title}</a></span>
            ))}</p>
          )}
        </div>
      )}

      {line && (
        <p className="mt-2 text-xs text-gray-700">
          {line.basis} = <span className="font-semibold tabular-nums">{fmt(line.net)}</span> in the budget
        </p>
      )}
      {skipped && (
        <p role="status" className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
          The budget&apos;s {TRAVEL_LABEL[kind].toLowerCase()} line has a number you typed, so it was left alone.{' '}
          {editable && <button onClick={onForce} className="font-medium underline">Use the estimate instead</button>}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {links.length > 0 ? (
          <>
            <span className="text-gray-400">Find and book:</span>
            {links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium text-accent hover:underline">{l.label} ↗</a>)}
            {editable && <button onClick={onTodo} className="font-medium text-gray-500 hover:text-gray-900">+ Add a to-do to book it</button>}
          </>
        ) : <span className="text-gray-400">Fill in the cities and dates above to get search links.</span>}
      </div>
    </div>
  )
}

export function BudgetAssumptionsPanel({ budget, client, offer, show, editable }: { budget: Budget; client: Client; offer?: TourOffer; show?: Show; editable: boolean }) {
  const updateBudget = useStore(s => s.updateBudget)
  const fillBudgetFromOffer = useStore(s => s.fillBudgetFromOffer)
  const addTask = useStore(s => s.addTask)
  const userId = useStore(s => s.userId)
  const fxRates = useStore(s => s.fxRates)
  const cur = budget.currency
  const fmt = currencyFormatter(cur)
  const { convert } = makeConverter(fxRates)

  const a: BudgetAssumptions = budget.assumptions ?? defaultAssumptions(client, show, offer)
  const covers = promoterCovers(offer?.terms, convert, cur)
  const computed = computeTravelLines(a, covers, fmt)
  const worked = TRAVEL_KINDS.some(k => budget.lines.some(l => l.bucket === TRAVEL_BUCKET[k] && l.calc))

  const [open, setOpen] = useState(() => !worked && budget.status === 'draft')
  const [busy, setBusy] = useState<TravelKind | null>(null)
  const [problem, setProblem] = useState('')
  const [notice, setNotice] = useState('')
  const [skipped, setSkipped] = useState<BudgetBucket[]>([])

  const nights = nightsBetween(a.arrive, a.depart)
  const historyCtx = { to: a.to ?? '', from: a.from, currency: cur, convert }
  const histories = { flight: historyEstimate(client, 'flight', historyCtx), hotel: historyEstimate(client, 'hotel', historyCtx), ground: historyEstimate(client, 'ground', historyCtx) }

  /** Saves new assumptions and re-works the travel lines from them. Reads the budget as it is NOW, so a slow web search can't overwrite edits made while it ran. */
  function commit(patch: Partial<BudgetAssumptions>, force?: BudgetBucket[]) {
    const latest = useStore.getState().getClient()?.finance.budgets?.find(b => b.id === budget.id) ?? budget
    const next: BudgetAssumptions = { ...(latest.assumptions ?? defaultAssumptions(client, show, offer)), ...patch }
    const res = applyTravelLines(latest.lines, computeTravelLines(next, covers, fmt), { force })
    updateBudget(budget.id, { assumptions: next, lines: res.lines })
    setSkipped(res.skipped)
    setNotice(''); setProblem('')
  }
  const setEstimate = (kind: TravelKind, est: BudgetEstimate | undefined, force?: BudgetBucket[]) => commit({ [kind]: est } as Partial<BudgetAssumptions>, force)

  function fromHistory(kind: TravelKind) {
    const h = histories[kind]
    if (h) setEstimate(kind, { amount: h.amount, source: 'history', low: h.low, high: h.high, note: h.note, asOf: today() })
  }

  async function searchWeb(kind: TravelKind) {
    if (!a.to || !a.arrive || !a.depart) return
    setBusy(kind); setProblem(''); setNotice('')
    try {
      const e = await requestWebEstimate(client.id, { kind, from: a.from, to: a.to, arrive: a.arrive, depart: a.depart, travelers: a.travelers, rooms: a.rooms })
      const inCur = (usd: number) => Math.round(convert(usd, 'USD', cur))
      setEstimate(kind, { amount: inCur(e.typical), source: 'web', low: inCur(e.low), high: inCur(e.high), note: e.notes, sources: e.sources, asOf: e.asOf })
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "Couldn't get an estimate from the web right now.")
    } finally { setBusy(null) }
  }

  function addBookingTodo(kind: TravelKind) {
    const line = computed.find(c => c.kind === kind)
    const t = bookingTodo(kind, a, line ? fmt(line.net) : undefined, today())
    const id = addTask(client.id, { ...t, assigneeId: userId ?? undefined, link: show ? { type: 'show', id: show.id } : offer ? { type: 'offer', id: offer.id } : undefined })
    setNotice(id ? `Added to your to-dos: ${t.title}` : "Couldn't add that to-do.")
  }

  function fill() {
    const r = fillBudgetFromOffer(budget.id)
    setProblem('')
    if (!r || !r.patch) { setNotice('Everything from the offer is already in this budget.'); return }
    setSkipped(r.skipped)
    setNotice(`Added from the offer: ${r.added.join(', ')}.`)
  }

  const coversText = [['flights', covers.flight], ['hotel', covers.hotel], ['ground', covers.ground]].filter(([, n]) => (n as number) > 0).map(([k, n]) => `${k} ${fmt(n as number)}`).join(' · ')
  const searchHint = !a.to || !a.arrive || !a.depart ? 'Add the show city and the dates first' : 'Add where they are flying from first'

  return (
    <section aria-label="Assumptions and travel" className="mb-4 rounded-xl border border-gray-200">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
        <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-widest text-gray-500">Assumptions &amp; travel</span>
        <span className="min-w-0 flex-1 truncate text-xs text-gray-500">{assumptionsSummary(a)}</span>
        <span className="flex-shrink-0 text-xs text-gray-400">{open ? 'Hide' : 'Open'}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-100 px-3 py-3">
          <p className="text-xs text-gray-500">
            Tell the budget the trip and it works out the travel lines for you. Type over any line in the budget below to take it back by hand.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <CountField label="People traveling" value={a.travelers} disabled={!editable} onCommit={n => commit({ travelers: n })} />
            <CountField label="Hotel rooms" value={a.rooms} disabled={!editable} onCommit={n => commit({ rooms: n })} />
            <DraftField label="Flying from" value={a.from ?? ''} placeholder="e.g. Los Angeles" disabled={!editable} onCommit={v => commit({ from: v || undefined })} />
            <DraftField label="Show city" value={a.to ?? ''} placeholder="e.g. Lisbon" disabled={!editable} onCommit={v => commit({ to: v || undefined })} />
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-500">Arrive</span>
              <input type="date" className={inputClass} value={a.arrive ?? ''} disabled={!editable} onChange={e => { if (e.target.value) commit({ arrive: e.target.value }) }} />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-gray-500">Leave {nights > 0 && <span className="font-medium normal-case tracking-normal text-gray-400">· {nights} {nights === 1 ? 'night' : 'nights'}</span>}</span>
              <input type="date" className={inputClass} value={a.depart ?? ''} disabled={!editable} onChange={e => { if (e.target.value) commit({ depart: e.target.value }) }} />
            </label>
          </div>

          {coversText && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
              The promoter covers: {coversText}. That is taken <strong>off</strong> the matching travel cost below (it is not counted as income, so no commission is charged on it).
            </p>
          )}

          <div className="space-y-2">
            {TRAVEL_KINDS.map(kind => (
              <EstimateRow
                key={kind} kind={kind} cur={cur} est={a[kind]} line={computed.find(c => c.kind === kind)} skipped={skipped.includes(TRAVEL_BUCKET[kind])}
                history={histories[kind]} links={bookingLinks(kind, a)} busy={busy === kind} editable={editable}
                canSearch={!!a.to && !!a.arrive && !!a.depart && (kind !== 'flight' || !!a.from)} searchHint={searchHint}
                onAmount={n => setEstimate(kind, n > 0 ? { amount: n, source: 'typed' } : undefined)}
                onHistory={() => fromHistory(kind)} onWeb={() => void searchWeb(kind)} onClear={() => setEstimate(kind, undefined)}
                onForce={() => setEstimate(kind, a[kind], [TRAVEL_BUCKET[kind]])} onTodo={() => addBookingTodo(kind)}
              />
            ))}
          </div>

          {problem && <p role="alert" className="text-xs text-red-600">{problem}</p>}
          {notice && <p role="status" className="text-xs text-green-700">{notice}</p>}

          {editable && (
            <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-3">
              <button onClick={fill} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50">Fill in from the offer</button>
              <span className="text-[11px] text-gray-400">Adds the offer&apos;s buyout and bonus lines and the travel lines above. It never overwrites a number you typed.</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
