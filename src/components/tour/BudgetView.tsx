'use client'
// ──────────────────────────────────────────────────────────
//  BudgetView — Tour → Budget. Every offer gets a draft budget the moment it
//  comes in; the Original locks when the offer is confirmed. Shows can be
//  grouped into named runs, each with a profit roll-up in the artist's home
//  currency (live exchange rates: Yahoo first, ECB as the backup).
// ──────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { BudgetEditor } from './BudgetEditor'
import {
  COMMISSION_BASE_LABEL, DEFAULT_COMMISSIONS, financeSettings, makeConverter, showFigures, computeBudget,
} from '@/lib/budget'
import type { Budget, BudgetCommission, Client, CommissionBase, Currency, Run, Show } from '@/types'

const money = (n: number, currency: string) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Math.round(n))
const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export function BudgetView() {
  const client = useStore(s => s.getClient())
  const fxRates = useStore(s => s.fxRates)
  const loadFxRates = useStore(s => s.loadFxRates)
  const selectedBudgetId = useStore(s => s.selectedBudgetId)
  const setSelectedBudget = useStore(s => s.setSelectedBudget)
  const addBudget = useStore(s => s.addBudget)
  const editable = useStore(s => s.canEdit('finance'))
  const [runId, setRunId] = useState<string | null>(null)
  const [runsOpen, setRunsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => { loadFxRates().catch(console.error) }, [loadFxRates])

  if (!client) return null
  const home = financeSettings(client).homeCurrency
  const { convert } = makeConverter(fxRates)
  const budgets = client.finance.budgets ?? []
  const runs = client.tour.runs ?? []
  const showById = new Map(client.tour.shows.map(s => [s.id, s]))
  const offers = client.agentData.offers

  const dateOf = (b: Budget) => showById.get(b.showId ?? '')?.date ?? offers.find(o => o.id === b.offerId)?.date ?? ''
  const byDate = (a: Budget, b: Budget) => dateOf(a).localeCompare(dateOf(b))
  const netHome = (b: Budget) => convert(computeBudget(b.lines, b.commissions).net, b.currency, home)
  const runOf = (b: Budget) => showById.get(b.showId ?? '')?.runId

  const selected = budgets.find(b => b.id === selectedBudgetId)
  const selectedRun = runs.find(r => r.id === runId)

  // Offers and shows that don't have a budget yet (offers made before budgets existed, shows added directly).
  const offerHasBudget = (id: string) => budgets.some(b => b.offerId === id)
  const showHasBudget = (id: string) => budgets.some(b => b.showId === id)
  const needOffer = offers.filter(o => (o.status === 'inquiry' || o.status === 'hold' || o.status === 'confirmed') && !offerHasBudget(o.id) && !(o.showId && showHasBudget(o.showId)))
  const needShow = client.tour.shows.filter(s => !showHasBudget(s.id) && !offers.some(o => o.showId === s.id))

  function open(id: string) { setRunId(null); setSelectedBudget(id) }
  function create(target: { showId?: string; offerId?: string }) { const id = addBudget(target); if (id) open(id) }

  const row = (b: Budget) => (
    <button
      key={b.id}
      onClick={() => open(b.id)}
      className={`w-full text-left px-3 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors ${selectedBudgetId === b.id && !runId ? 'bg-blue-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">{b.name}</span>
        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full flex-shrink-0 ${b.status === 'locked' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
          {b.status === 'locked' ? 'Locked' : 'Draft'}
        </span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>{dateOf(b) ? shortDate(dateOf(b)) : 'No date'}</span>
        <span className="tabular-nums">Net {money(netHome(b), home)}</span>
      </div>
    </button>
  )

  const ungrouped = budgets.filter(b => !runOf(b)).sort(byDate)

  return (
    <div className="flex-1 min-h-0 flex overflow-hidden">
      {/* ── Left: runs + budgets ── */}
      <div className="w-[300px] flex-shrink-0 border-r border-gray-100 overflow-auto">
        <div className="flex items-center gap-1.5 px-3 py-3 border-b border-gray-100">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 flex-1">Budgets</div>
          {editable && <button onClick={() => setRunsOpen(true)} className="text-[11px] text-blue-500 hover:underline">Runs</button>}
          {editable && <button onClick={() => setSettingsOpen(true)} className="text-[11px] text-blue-500 hover:underline">Settings</button>}
        </div>

        {runs.map(r => {
          const rb = budgets.filter(b => runOf(b) === r.id).sort(byDate)
          const total = rb.reduce((a, b) => a + netHome(b), 0)
          return (
            <div key={r.id}>
              <button
                onClick={() => { setRunId(r.id); setSelectedBudget(null) }}
                className={`w-full text-left px-3 py-2 bg-gray-50 border-y border-gray-100 flex items-center justify-between hover:bg-gray-100 ${runId === r.id ? 'ring-1 ring-inset ring-blue-300' : ''}`}
              >
                <span className="text-xs font-bold truncate">{r.name}</span>
                <span className="text-[11px] text-gray-500 tabular-nums">{money(total, home)}</span>
              </button>
              {rb.map(row)}
              {rb.length === 0 && <div className="px-3 py-2 text-[11px] text-gray-300">No budgeted shows in this run yet</div>}
            </div>
          )
        })}

        {ungrouped.length > 0 && (
          <div>
            {runs.length > 0 && <div className="px-3 py-1.5 bg-gray-50 border-y border-gray-100 text-xs font-bold text-gray-400">Not in a run</div>}
            {ungrouped.map(row)}
          </div>
        )}

        {(needOffer.length > 0 || needShow.length > 0) && editable && (
          <div className="px-3 py-3">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">No budget yet</div>
            {needOffer.map(o => (
              <div key={o.id} className="flex items-center justify-between gap-2 py-1">
                <span className="text-xs text-gray-600 truncate">Offer · {o.venue}, {o.city}</span>
                <button onClick={() => create({ offerId: o.id })} className="text-[11px] text-blue-500 hover:underline flex-shrink-0">Create</button>
              </div>
            ))}
            {needShow.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-2 py-1">
                <span className="text-xs text-gray-600 truncate">Show · {s.venue}, {s.city}</span>
                <button onClick={() => create({ showId: s.id })} className="text-[11px] text-blue-500 hover:underline flex-shrink-0">Create</button>
              </div>
            ))}
          </div>
        )}

        {budgets.length === 0 && needOffer.length === 0 && needShow.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-gray-300">A budget is drafted automatically whenever an offer comes in.</div>
        )}
      </div>

      {/* ── Right: run roll-up or the budget ── */}
      <div className="flex-1 overflow-auto p-6">
        {selectedRun ? (
          <RunSummary run={selectedRun} client={client} home={home} />
        ) : selected ? (
          <BudgetEditor key={selected.id} budget={selected} client={client} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-gray-300">
            <span className="text-4xl">🧾</span>
            <span className="text-sm">Select a budget, or a run for its roll-up</span>
          </div>
        )}
      </div>

      {runsOpen && <ManageRunsModal client={client} onClose={() => setRunsOpen(false)} />}
      {settingsOpen && <BudgetSettingsModal client={client} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

// ── Run roll-up: profit across the whole run, in the home currency ──
function RunSummary({ run, client, home }: { run: Run; client: Client; home: Currency }) {
  const fxRates = useStore(s => s.fxRates)
  const shows = client.tour.shows.filter(s => s.runId === run.id).sort((a, b) => a.date.localeCompare(b.date))
  const budgets = client.finance.budgets ?? []
  const rows = shows.map(s => ({ show: s, f: showFigures(client, s, budgets.find(b => b.showId === s.id), home, fxRates) }))
  const sum = (pick: (f: ReturnType<typeof showFigures>) => number | null) => rows.reduce((a, r) => a + (pick(r.f) ?? 0), 0)
  const th = 'text-right px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400'
  const td = 'text-right px-3 py-2 text-sm tabular-nums'

  return (
    <div className="max-w-4xl">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Run</div>
      <h2 className="font-serif text-xl font-medium mb-1">{run.name}</h2>
      <div className="text-xs text-gray-400 mb-4">{shows.length} show{shows.length === 1 ? '' : 's'} · all figures in {home}, at today&apos;s exchange rates</div>
      {rows.length === 0 ? (
        <div className="text-sm text-gray-400">No shows in this run yet. Use “Runs” to add some.</div>
      ) : (
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Show</th>
                <th className={th}>Gross</th><th className={th}>Budgeted costs</th><th className={th}>Actual costs</th>
                <th className={th}>Net (budget)</th><th className={th}>Net (actual)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ show, f }) => (
                <tr key={show.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-sm">
                    <div className="font-medium">{show.venue}</div>
                    <div className="text-[11px] text-gray-400">{show.city} · {shortDate(show.date)}</div>
                  </td>
                  <td className={td}>{money(f.gross, home)}</td>
                  <td className={td}>{f.budgetCosts === null ? <span className="text-gray-300">no budget</span> : money(f.budgetCosts, home)}</td>
                  <td className={td}>{money(f.actualCosts, home)}</td>
                  <td className={td}>{f.netCurrent === null ? <span className="text-gray-300">—</span> : money(f.netCurrent, home)}</td>
                  <td className={`${td} font-semibold`}>{money(f.netActual, home)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-gray-600">Run total</td>
                <td className={`${td} font-bold`}>{money(sum(f => f.gross), home)}</td>
                <td className={`${td} font-bold`}>{money(sum(f => f.budgetCosts), home)}</td>
                <td className={`${td} font-bold`}>{money(sum(f => f.actualCosts), home)}</td>
                <td className={`${td} font-bold`}>{money(sum(f => f.netCurrent), home)}</td>
                <td className={`${td} font-bold`}>{money(sum(f => f.netActual), home)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-400 mt-3">
        Costs shared across the run (like an international flight assigned to the whole run) are split evenly across its shows. Income for “Net (actual)” stays at the budgeted amount until a settlement is recorded.
      </p>
    </div>
  )
}

// ── Group shows into named runs ──
function ManageRunsModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const { addRun, renameRun, deleteRun, setShowRun } = useStore()
  const [name, setName] = useState('')
  const runs = client.tour.runs ?? []
  const shows: Show[] = [...client.tour.shows].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <Modal wide title="Runs" onClose={onClose} footer={
      <button onClick={onClose} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Done</button>
    }>
      <p className="text-xs text-gray-500">A run is a named group of shows, like “Europe, Fall 2026”. A show can be in one run. Costs assigned to a run are shared evenly across its shows.</p>

      <div className="flex gap-2">
        <input className={inputClass} placeholder="New run name…" value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && name.trim()) { addRun(name); setName('') } }} />
        <button onClick={() => { if (name.trim()) { addRun(name); setName('') } }} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 whitespace-nowrap">Add run</button>
      </div>

      {runs.length > 0 && (
        <div className="space-y-1">
          {runs.map(r => (
            <div key={r.id} className="flex items-center gap-2">
              <input className={`${inputClass} !py-1`} defaultValue={r.name} onBlur={e => { if (e.target.value.trim() && e.target.value !== r.name) renameRun(r.id, e.target.value) }} />
              <span className="text-[11px] text-gray-400 whitespace-nowrap">{shows.filter(s => s.runId === r.id).length} shows</span>
              <button onClick={() => { if (confirm(`Delete the run "${r.name}"? Its shows stay, just un-grouped.`)) deleteRun(r.id) }} className="text-xs text-red-400 hover:text-red-500">Delete</button>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-gray-100 pt-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Which run is each show in?</div>
        {shows.length === 0 && <div className="text-xs text-gray-300">No shows yet.</div>}
        {shows.map(s => (
          <div key={s.id} className="flex items-center gap-2 py-1">
            <div className="flex-1 min-w-0 text-sm truncate">{s.venue} <span className="text-gray-400">· {s.city} · {shortDate(s.date)}</span></div>
            <select className={`${selectClass} !w-44 !py-1`} value={s.runId ?? ''} onChange={e => setShowRun(s.id, e.target.value || null)} disabled={runs.length === 0}>
              <option value="">No run</option>
              {runs.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── Home currency + this artist's default commissions ──
function BudgetSettingsModal({ client, onClose }: { client: Client; onClose: () => void }) {
  const setFinanceSettings = useStore(s => s.setFinanceSettings)
  const current = financeSettings(client)
  const [home, setHome] = useState<Currency>(current.homeCurrency)
  const [commissions, setCommissions] = useState<Omit<BudgetCommission, 'id'>[]>(current.defaultCommissions.map(c => ({ ...c })))

  const patch = (i: number, p: Partial<Omit<BudgetCommission, 'id'>>) => setCommissions(cs => cs.map((c, j) => j === i ? { ...c, ...p } : c))

  return (
    <Modal wide title={`Budget settings · ${client.name}`} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button
          onClick={() => { setFinanceSettings({ homeCurrency: home, defaultCommissions: commissions.filter(c => c.label.trim()) }); onClose() }}
          className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600"
        >Save</button>
      </>
    }>
      <FormField label="Home currency (run totals and lists are shown in this)">
        <select className={selectClass} value={home} onChange={e => setHome(e.target.value as Currency)}>
          <option>USD</option><option>GBP</option><option>EUR</option>
        </select>
      </FormField>

      <div>
        <div className="text-xs font-semibold text-gray-500 mb-1">Default commissions for this artist</div>
        <p className="text-[11px] text-gray-400 mb-2">Every new budget starts with these. Leave it empty if the artist has none (no agent, no business manager, and so on). You can still change them on any single budget.</p>
        <div className="space-y-1.5">
          {commissions.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input className={`${inputClass} !py-1`} value={c.label} onChange={e => patch(i, { label: e.target.value })} placeholder="e.g. Agent" />
              {c.base !== 'flat'
                ? <><input className={`${inputClass} !py-1 !w-16 text-right`} value={c.pct} onChange={e => patch(i, { pct: Number(e.target.value) || 0 })} /><span className="text-xs text-gray-400">%</span></>
                : <input className={`${inputClass} !py-1 !w-24 text-right`} value={c.flat ?? 0} onChange={e => patch(i, { flat: Number(e.target.value) || 0 })} />}
              <select className={`${selectClass} !py-1 !w-56`} value={c.base} onChange={e => patch(i, { base: e.target.value as CommissionBase })}>
                {(Object.keys(COMMISSION_BASE_LABEL) as CommissionBase[]).map(b => <option key={b} value={b}>{COMMISSION_BASE_LABEL[b]}</option>)}
              </select>
              <button onClick={() => setCommissions(cs => cs.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400 px-1">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-3 mt-2">
          <button className="text-xs text-blue-500 hover:underline" onClick={() => setCommissions(cs => [...cs, { label: '', pct: 5, base: 'gross' }])}>+ Add commission</button>
          <button className="text-xs text-gray-400 hover:text-blue-500" onClick={() => setCommissions(DEFAULT_COMMISSIONS.map(c => ({ ...c })))}>Reset to Agent 10 / Management 15 / Biz mgmt 4</button>
        </div>
      </div>
    </Modal>
  )
}
