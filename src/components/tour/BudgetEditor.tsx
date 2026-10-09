'use client'
// ──────────────────────────────────────────────────────────
//  BudgetEditor — one show's budget, laid out like Eli's example PDF:
//  Income → Sound & Lights → Production costs → Commissions → Net, with
//  Original (locked when the offer is confirmed) vs Current vs Actual, and
//  every commission editable (own %, own base, or a flat amount).
// ──────────────────────────────────────────────────────────

import { Fragment, useState } from 'react'
import { useStore } from '@/lib/store'
import { inputClass } from '@/components/ui/Modal'
import {
  BUCKET_LABEL, BUCKET_SECTION, COMMISSION_BASE_LABEL, PRODUCTION_BUCKETS, actualCostsForShow, computeBudget,
  crewLineAmount, crewPerDiem, crewRoleShort, newCommission, newLine, pctOfGross, type CrewDays,
} from '@/lib/budget'
import type { Budget, BudgetBucket, BudgetCommission, BudgetLine, BudgetSection, Client, CommissionBase, Currency } from '@/types'

const money = (n: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Math.round(n))

// A number box that only saves when you tab/click away or press Enter, so typing
// a figure doesn't save a half-typed value on every keystroke.
function NumInput({ value, onCommit, disabled, className = '' }: { value: number; onCommit: (n: number) => void; disabled?: boolean; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? String(value)
  function commit() {
    if (draft === null) return
    const n = Number(draft.replace(/,/g, ''))
    setDraft(null)
    if (Number.isFinite(n) && n !== value) onCommit(n)
  }
  return (
    <input
      type="text" inputMode="decimal" disabled={disabled}
      className={`w-full px-2 py-1 border border-gray-200 rounded-md text-sm text-right outline-none focus:border-blue-400 bg-canvas disabled:opacity-60 disabled:border-transparent ${className}`}
      value={shown}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

function TextInput({ value, onCommit, disabled, className = '' }: { value: string; onCommit: (s: string) => void; disabled?: boolean; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  function commit() {
    if (draft === null) return
    const v = draft.trim()
    setDraft(null)
    if (v && v !== value) onCommit(v)
  }
  return (
    <input
      type="text" disabled={disabled}
      className={`w-full px-2 py-1 border border-transparent hover:border-gray-200 rounded-md text-sm outline-none focus:border-blue-400 bg-transparent disabled:opacity-100 ${className}`}
      value={draft ?? value}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
    />
  )
}

const COLS = 'grid grid-cols-[minmax(0,1fr)_104px_116px_104px_64px] gap-2 items-center'

function Cell({ n, currency, muted, bold }: { n: number | null | undefined; currency: string; muted?: boolean; bold?: boolean }) {
  return (
    <div className={`text-right text-sm tabular-nums ${bold ? 'font-bold' : ''} ${muted ? 'text-gray-400' : ''}`}>
      {n === null || n === undefined ? <span className="text-gray-300">—</span> : money(n, currency)}
    </div>
  )
}

function TotalRow({ label, orig, cur, act, gross, currency, strong }: {
  label: string; orig: number | null; cur: number; act: number | null; gross: number; currency: string; strong?: boolean
}) {
  return (
    <div className={`${COLS} px-3 py-2 ${strong ? 'bg-gray-50 border-y border-gray-200' : 'border-t border-gray-100'}`}>
      <div className={`text-xs uppercase tracking-wide ${strong ? 'font-bold text-gray-700' : 'font-semibold text-gray-500'}`}>{label}</div>
      <Cell n={orig} currency={currency} bold muted />
      <Cell n={cur} currency={currency} bold />
      <Cell n={act} currency={currency} bold />
      <div className="text-right text-xs text-gray-400 tabular-nums">{gross > 0 ? `${pctOfGross(cur, gross).toFixed(1)}%` : ''}</div>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pt-4 pb-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">{children}</div>
}

export function BudgetEditor({ budget, client }: { budget: Budget; client: Client }) {
  const updateBudget = useStore(s => s.updateBudget)
  const deleteBudget = useStore(s => s.deleteBudget)
  const fxRates = useStore(s => s.fxRates)
  const editable = useStore(s => s.canEdit('finance'))
  const [addBucket, setAddBucket] = useState<BudgetBucket>('supplies')

  const show = client.tour.shows.find(s => s.id === budget.showId)
  const offer = client.agentData.offers.find(o => o.id === budget.offerId)
  const original = budget.original
  const cur = budget.currency
  const people = new Map(client.people.map(p => [p.id, p.name]))
  const crewById = new Map(client.tour.crew.map(m => [m.id, m]))
  const rateOf = (crewMemberId?: string) => client.finance.crewRates.find(r => r.crewMemberId === crewMemberId)

  const now = computeBudget(budget.lines, budget.commissions)
  const was = original ? computeBudget(original.lines, original.commissions) : null
  const origLine = (id: string) => original?.lines.find(l => l.id === id)

  // Actual costs are real travel costs + expenses assigned to this show (income
  // stays at Current until the settlement is recorded).
  const actual = show ? actualCostsForShow(client, show, cur, fxRates) : null
  const actualLines: BudgetLine[] = actual
    ? [
        ...budget.lines.filter(l => l.section === 'income'),
        ...Object.entries(actual.byBucket).map(([bucket, amount]) => newLine(bucket as BudgetBucket, bucket, amount ?? 0)),
      ]
    : []
  const act = actual ? computeBudget(actualLines, budget.commissions) : null
  const actualOf = (bucket: BudgetBucket) => (actual ? actual.byBucket[bucket] ?? 0 : null)

  const patchLine = (id: string, patch: Partial<BudgetLine>) =>
    updateBudget(budget.id, { lines: budget.lines.map(l => l.id === id ? { ...l, ...patch } : l) })
  const removeLine = (id: string) => updateBudget(budget.id, { lines: budget.lines.filter(l => l.id !== id) })
  const addLine = (bucket: BudgetBucket, label: string, extra: Partial<BudgetLine> = {}) =>
    updateBudget(budget.id, { lines: [...budget.lines, newLine(bucket, label, 0, extra)] })
  const patchCommission = (id: string, patch: Partial<BudgetCommission>) =>
    updateBudget(budget.id, { commissions: budget.commissions.map(c => c.id === id ? { ...c, ...patch } : c) })

  function setCrewDays(line: BudgetLine, key: keyof CrewDays, value: number) {
    const rate = rateOf(line.crewMemberId)
    const days: CrewDays = { advance: 0, travel: 0, show: 0, ...(line.days ?? {}), [key]: Math.max(0, value) }
    patchLine(line.id, { days, amount: rate ? crewLineAmount(rate, days) : line.amount })
  }

  // Re-work every crew line and the per-diem line from the saved rates.
  function recalcFromRates() {
    let perDiems = 0
    const lines = budget.lines.map(l => {
      const rate = rateOf(l.crewMemberId)
      if (!l.crewMemberId || !rate) return l
      const days = l.days ?? { advance: 1, travel: 0, show: 1 }
      perDiems += crewPerDiem(rate, days)
      return { ...l, amount: crewLineAmount(rate, days) }
    })
    updateBudget(budget.id, { lines: lines.map(l => l.bucket === 'per_diems' ? { ...l, amount: perDiems } : l) })
  }

  const crewNotInBudget = client.finance.crewRates.filter(r => crewById.has(r.crewMemberId) && !budget.lines.some(l => l.crewMemberId === r.crewMemberId))

  const dateText = (show?.date ?? offer?.date)
    ? new Date(((show?.date ?? offer?.date) as string) + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  // (Plain render helpers, not components: a component defined here would remount - and drop
  // focus from the input being typed in - on every keystroke.)
  const renderLine = (l: BudgetLine, showActual: boolean, indent?: boolean) => {
    const o = origLine(l.id)
    const crew = l.crewMemberId ? crewById.get(l.crewMemberId) : undefined
    const rate = rateOf(l.crewMemberId)
    return (
      <div className="px-3 py-1 border-t border-gray-50">
        <div className={COLS}>
          <div className={`flex items-center gap-1 ${indent ? 'pl-4' : ''}`}>
            <TextInput value={l.label} onCommit={label => patchLine(l.id, { label })} disabled={!editable} />
          </div>
          <Cell n={original ? (o?.amount ?? 0) : null} currency={cur} muted />
          {editable ? <NumInput value={l.amount} onCommit={amount => patchLine(l.id, { amount })} /> : <Cell n={l.amount} currency={cur} />}
          <Cell n={showActual ? actualOf(l.bucket) : null} currency={cur} />
          <div className="text-right text-xs text-gray-400 tabular-nums flex items-center justify-end gap-1">
            {now.gross > 0 ? `${pctOfGross(l.amount, now.gross).toFixed(1)}%` : ''}
            {editable && l.section !== 'income' && (
              <button onClick={() => removeLine(l.id)} className="text-gray-300 hover:text-red-400" title="Remove line">×</button>
            )}
          </div>
        </div>
        {crew && rate && l.days && (
          <div className="flex items-center gap-2 pl-5 pb-1 text-[11px] text-gray-400">
            <span>{people.get(crew.personId) ?? 'Crew'}:</span>
            {(['advance', 'travel', 'show'] as const).map(k => (
              <label key={k} className="flex items-center gap-1">
                <input
                  type="number" min={0} step={0.5} disabled={!editable}
                  className="w-12 px-1 py-0.5 border border-gray-200 rounded text-[11px] text-right bg-canvas"
                  value={l.days![k]} onChange={e => setCrewDays(l, k, Number(e.target.value))}
                />
                {k} {k === 'show' && rate.rateUnit === 'show' ? '' : 'day(s)'}
              </label>
            ))}
            <span className="ml-1">· rate {rate.rateUnit === 'show' ? `${money(rate.rateShow, cur)}/show` : `${money(rate.rateShow, cur)} show day`}</span>
          </div>
        )}
      </div>
    )
  }

  // Production lines grouped by bucket, so e.g. several Labor lines get one subtotal with the actual.
  const renderGroups = (section: BudgetSection, buckets: BudgetBucket[]) => {
    return (
      <>
        {buckets.map(bucket => {
          const lines = budget.lines.filter(l => l.section === section && l.bucket === bucket)
          if (lines.length === 0) return null
          if (lines.length === 1) return <Fragment key={lines[0].id}>{renderLine(lines[0], true)}</Fragment>
          const subtotalOrig = original ? lines.reduce((a, l) => a + (origLine(l.id)?.amount ?? 0), 0) : null
          return (
            <div key={bucket}>
              {lines.map(l => <Fragment key={l.id}>{renderLine(l, false, true)}</Fragment>)}
              <div className={`${COLS} px-3 py-1 border-t border-gray-100 bg-gray-50/60`}>
                <div className="text-[11px] font-semibold text-gray-500 pl-4">{BUCKET_LABEL[bucket]} — total</div>
                <Cell n={subtotalOrig} currency={cur} muted />
                <Cell n={lines.reduce((a, l) => a + l.amount, 0)} currency={cur} />
                <Cell n={actualOf(bucket)} currency={cur} />
                <div />
              </div>
            </div>
          )
        })}
      </>
    )
  }

  return (
    <div className="max-w-4xl">
      {/* Header, like the PDF's title block */}
      <div className="flex items-start justify-between gap-4 mb-1">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Budget · V{budget.version}</div>
          <h2 className="font-serif text-xl font-medium truncate">{budget.name}</h2>
          <div className="text-sm text-gray-500">{dateText}</div>
        </div>
        <div className="text-right text-xs text-gray-400 flex-shrink-0">
          <div className="uppercase tracking-widest font-bold text-gray-500">Confidential</div>
          {budget.updatedAt && <div>Last updated {new Date(budget.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>}
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <span>Currency</span>
            <select
              className="px-1.5 py-0.5 border border-gray-200 rounded text-xs bg-canvas" disabled={!editable}
              value={cur} onChange={e => updateBudget(budget.id, { currency: e.target.value as Currency })}
              title="Changing the currency relabels the amounts; it doesn't convert them"
            >
              <option>USD</option><option>GBP</option><option>EUR</option>
            </select>
          </div>
        </div>
      </div>

      <div className={`text-xs rounded-lg px-3 py-2 mb-3 ${original ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
        {original
          ? `Original locked ${budget.lockedAt ? new Date(budget.lockedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''} when the offer was confirmed. Edits now change “Current” only.`
          : 'Draft — you can edit freely. The Original locks automatically when this offer is confirmed.'}
        {actual && actual.missingRates.length > 0 && <span className="ml-2 text-amber-700">Some costs are in {actual.missingRates.join(', ')} and no exchange rate was available, so they are counted 1:1.</span>}
      </div>

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className={`${COLS} px-3 py-2 bg-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-200`}>
          <div>Line</div><div className="text-right">Original</div><div className="text-right">Current</div><div className="text-right">Actual</div><div className="text-right">% gross</div>
        </div>

        <SectionTitle>Income</SectionTitle>
        {renderGroups('income', ['guarantee', 'overage'])}
        <TotalRow label="Total gross income" orig={was?.gross ?? null} cur={now.gross} act={null} gross={now.gross} currency={cur} />

        <SectionTitle>Sound &amp; lights</SectionTitle>
        {renderGroups('sound_lights', ['sound_lights'])}
        {editable && (
          <div className="px-3 py-1"><button className="text-[11px] text-blue-500 hover:underline" onClick={() => addLine('sound_lights', 'Sound & lights')}>+ Add line</button></div>
        )}
        <TotalRow label="Total sound & lights" orig={was?.soundLights ?? null} cur={now.soundLights} act={act ? (actual?.byBucket.sound_lights ?? 0) : null} gross={now.gross} currency={cur} />
        <TotalRow label="Adjusted income after sound & lights" orig={was?.adjustedAfterSL ?? null} cur={now.adjustedAfterSL} act={act?.adjustedAfterSL ?? null} gross={now.gross} currency={cur} strong />

        <SectionTitle>Production costs</SectionTitle>
        {renderGroups('production', PRODUCTION_BUCKETS)}
        {editable && (
          <div className="px-3 py-2 flex flex-wrap items-center gap-2">
            <select className="px-1.5 py-0.5 border border-gray-200 rounded text-[11px] bg-canvas" value={addBucket} onChange={e => setAddBucket(e.target.value as BudgetBucket)}>
              {PRODUCTION_BUCKETS.map(b => <option key={b} value={b}>{BUCKET_LABEL[b]}</option>)}
            </select>
            <button className="text-[11px] text-blue-500 hover:underline" onClick={() => addLine(addBucket, BUCKET_LABEL[addBucket])}>+ Add line</button>
            {crewNotInBudget.length > 0 && (
              <select
                className="px-1.5 py-0.5 border border-gray-200 rounded text-[11px] bg-canvas" value=""
                onChange={e => {
                  const rate = rateOf(e.target.value); const m = crewById.get(e.target.value)
                  if (!rate || !m) return
                  const days: CrewDays = { advance: 1, travel: 0, show: 1 }
                  addLine('labor', `Labor — ${crewRoleShort(m.role)} (${people.get(m.personId) ?? 'Crew'})`, { crewMemberId: m.id, days, amount: crewLineAmount(rate, days) })
                }}
              >
                <option value="">+ Add crew from saved rates…</option>
                {crewNotInBudget.map(r => <option key={r.crewMemberId} value={r.crewMemberId}>{people.get(crewById.get(r.crewMemberId)!.personId) ?? 'Crew'}</option>)}
              </select>
            )}
            <button className="text-[11px] text-gray-400 hover:text-blue-500 ml-auto" onClick={recalcFromRates} title="Re-work crew pay and per diems from each person's saved rates and days">Recalculate crew from saved rates</button>
          </div>
        )}
        <TotalRow label="Total production costs" orig={was?.production ?? null} cur={now.production} act={act ? Object.entries(actual!.byBucket).filter(([b]) => BUCKET_SECTION[b as BudgetBucket] === 'production').reduce((a, [, v]) => a + (v ?? 0), 0) : null} gross={now.gross} currency={cur} />
        <TotalRow label="Adjusted income after production costs" orig={was?.adjustedAfterProduction ?? null} cur={now.adjustedAfterProduction} act={act?.adjustedAfterProduction ?? null} gross={now.gross} currency={cur} strong />

        <SectionTitle>Commissions</SectionTitle>
        {budget.commissions.length === 0 && <div className="px-3 py-1 text-xs text-gray-300">No commissions on this budget.</div>}
        {budget.commissions.map(c => {
          const oc = original?.commissions.find(x => x.id === c.id)
          return (
            <div key={c.id} className={`${COLS} px-3 py-1 border-t border-gray-50`}>
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="min-w-[110px] flex-1"><TextInput value={c.label} onCommit={label => patchCommission(c.id, { label })} disabled={!editable} /></div>
                {c.base !== 'flat' && (
                  <div className="w-16"><NumInput value={c.pct} onCommit={pct => patchCommission(c.id, { pct })} disabled={!editable} className="!py-0.5" /></div>
                )}
                {c.base !== 'flat' && <span className="text-xs text-gray-400">%</span>}
                <select
                  className="px-1.5 py-0.5 border border-gray-200 rounded text-[11px] bg-canvas max-w-[190px]" disabled={!editable}
                  value={c.base} onChange={e => patchCommission(c.id, { base: e.target.value as CommissionBase })}
                >
                  {(Object.keys(COMMISSION_BASE_LABEL) as CommissionBase[]).map(b => <option key={b} value={b}>{COMMISSION_BASE_LABEL[b]}</option>)}
                </select>
                {c.base === 'flat' && (
                  <div className="w-24"><NumInput value={c.flat ?? 0} onCommit={flat => patchCommission(c.id, { flat })} disabled={!editable} className="!py-0.5" /></div>
                )}
              </div>
              <Cell n={was && oc ? was.commissions[c.id] : was ? 0 : null} currency={cur} muted />
              <Cell n={now.commissions[c.id]} currency={cur} />
              <Cell n={act ? act.commissions[c.id] : null} currency={cur} />
              <div className="text-right text-xs text-gray-400 tabular-nums flex items-center justify-end gap-1">
                {now.gross > 0 ? `${pctOfGross(now.commissions[c.id], now.gross).toFixed(1)}%` : ''}
                {editable && (
                  <button onClick={() => updateBudget(budget.id, { commissions: budget.commissions.filter(x => x.id !== c.id) })} className="text-gray-300 hover:text-red-400" title="Remove commission">×</button>
                )}
              </div>
            </div>
          )
        })}
        {editable && (
          <div className="px-3 py-1">
            <button className="text-[11px] text-blue-500 hover:underline" onClick={() => updateBudget(budget.id, { commissions: [...budget.commissions, newCommission({ label: 'Commission', pct: 5, base: 'gross' })] })}>+ Add commission</button>
          </div>
        )}
        <TotalRow label="Total commissions" orig={was?.totalCommissions ?? null} cur={now.totalCommissions} act={act?.totalCommissions ?? null} gross={now.gross} currency={cur} />
        <TotalRow label="Net income after commissions" orig={was?.net ?? null} cur={now.net} act={act?.net ?? null} gross={now.gross} currency={cur} strong />
      </div>

      <div className="mt-4">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Notes / assumptions</div>
        <NotesBox value={budget.notes ?? ''} editable={editable} onCommit={notes => updateBudget(budget.id, { notes })} />
      </div>

      {editable && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => { if (confirm('Delete this budget? This can\'t be undone.')) deleteBudget(budget.id) }}
            className="text-xs text-red-400 hover:text-red-500"
          >
            Delete budget
          </button>
        </div>
      )}
    </div>
  )
}

function NotesBox({ value, editable, onCommit }: { value: string; editable: boolean; onCommit: (s: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <textarea
      rows={4} disabled={!editable} className={`${inputClass} resize-y`}
      placeholder="e.g. 1 day total: show day Sat or Sun · local crew, zero flights/hotels · artist (1), crew (6)…"
      value={draft ?? value}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { if (draft !== null && draft !== value) onCommit(draft); setDraft(null) }}
    />
  )
}

