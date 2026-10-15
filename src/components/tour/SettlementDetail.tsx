'use client'
// ──────────────────────────────────────────────────────────
//  SettlementDetail — a saved settlement: the high-level numbers up top, the itemized
//  statement folded below (open any part), the settled P&L for each show it covers,
//  payments against what is owed, and the arithmetic checks.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, inputClass } from '@/components/ui/Modal'
import { Checks, Fold, PayoutTable, PromoterCosts, TicketTable } from '@/components/tour/SettlementSections'
import { checkSettlement, money2, paidSoFar } from '@/lib/settlement-math'
import { settledPnl, settlementEarned, type PnlColumn } from '@/lib/budget'
import { longDate } from '@/lib/offer-sheet'
import type { Currency } from '@/types'

const ROWS: { key: keyof PnlColumn; label: string; strong?: boolean }[] = [
  { key: 'gross', label: 'Gross income' },
  { key: 'soundLights', label: 'Sound & lights' },
  { key: 'production', label: 'Production costs' },
  { key: 'commissions', label: 'Commissions' },
  { key: 'net', label: 'Net income after commissions', strong: true },
]

export function SettlementDetail({ settlementId, onClose }: { settlementId: string; onClose: () => void }) {
  const client = useStore(s => s.getClient())
  const fxRates = useStore(s => s.fxRates)
  const editable = useStore(s => s.canEdit('finance'))
  const addSettlementPayment = useStore(s => s.addSettlementPayment)
  const deleteSettlement = useStore(s => s.deleteSettlement)
  const [pay, setPay] = useState({ label: 'Payment received', amount: '' })
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const st = client?.finance.settlements?.find(x => x.id === settlementId)
  if (!client || !st) return null
  const cur: Currency = st.currency
  const m = (n: number) => money2(n, cur)
  const shows = st.showIds.map(id => client.tour.shows.find(s => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s)
  const paid = paidSoFar(st)
  const balance = st.balanceDue ?? st.totalDue - paid
  const earned = settlementEarned(st)
  const checks = checkSettlement(st, cur)
  const problems = checks.filter(c => !c.ok).length

  async function recordPayment() {
    const amount = Number(pay.amount)
    if (!Number.isFinite(amount) || amount <= 0) return
    setBusy(true); setError('')
    const result = await addSettlementPayment(settlementId, { label: pay.label.trim() || 'Payment received', amount })
    setBusy(false)
    if (result.ok) setPay({ label: 'Payment received', amount: '' }); else setError(result.error)
  }

  async function remove() {
    setBusy(true); setError('')
    const result = await deleteSettlement(settlementId)
    setBusy(false)
    if (result.ok) onClose(); else setError(result.error)
  }

  return (
    <Modal title={st.venue ?? st.eventName ?? 'Settlement'} onClose={onClose} wide footer={
      <>
        {editable && !confirmingDelete && <button onClick={() => setConfirmingDelete(true)} className="px-3 py-1.5 text-sm text-red-400 hover:text-red-500 mr-auto">Delete…</button>}
        {editable && confirmingDelete && (
          <div className="mr-auto flex items-center gap-2 text-sm">
            <span className="text-red-600">Delete this settlement? The offer goes back to Confirmed.</span>
            <button onClick={remove} disabled={busy} className="px-2.5 py-1 bg-red-500 text-white rounded-lg text-xs font-medium disabled:opacity-50">Yes, delete</button>
            <button onClick={() => setConfirmingDelete(false)} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs">No</button>
          </div>
        )}
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>
      </>
    }>
      <div className="text-xs text-gray-400 -mt-3">
        {[st.promoter, st.eventName, st.preparedOn ? `prepared ${longDate(st.preparedOn)}` : '', st.preparedBy ? `by ${st.preparedBy}` : ''].filter(Boolean).join(' · ')}
        {st.filePath && (
          <> · <a className="text-accent hover:underline" target="_blank" rel="noreferrer" href={`/api/settlements/file?clientId=${encodeURIComponent(client.id)}&path=${encodeURIComponent(st.filePath)}`}>View the original</a></>
        )}
      </div>

      {/* High level */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        {[
          ['Earned', m(earned)],
          ['Total due', m(st.totalDue)],
          ['Received', m(paid)],
          ['Balance due', m(balance)],
        ].map(([label, value], i) => (
          <div key={label} className={`rounded-lg px-2 py-2 ${i === 3 ? (balance > 0.005 ? 'bg-amber-50' : 'bg-green-50') : 'bg-gray-50'}`}>
            <div className="text-[10px] uppercase tracking-widest text-gray-400">{label}</div>
            <div className={`text-sm font-semibold ${i === 3 ? (balance > 0.005 ? 'text-amber-800' : 'text-green-800') : ''}`}>{value}</div>
          </div>
        ))}
      </div>
      <div className="text-xs text-gray-500">
        {st.attendance?.sold ? `${st.attendance.sold.toLocaleString('en-US')} tickets sold${st.attendance.capacity ? ` of ${st.attendance.capacity.toLocaleString('en-US')}` : ''} · ` : ''}
        {st.summary?.gross ? `gross ${m(st.summary.gross)} · ` : ''}
        {st.summary?.netShowReceipts ? `net show receipts ${m(st.summary.netShowReceipts)} · ` : ''}
        {st.deal?.description ?? ''}
      </div>

      {/* The settled P&L */}
      <div className="space-y-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Settled P&amp;L{shows.length > 1 ? ` · split evenly across ${shows.length} shows` : ''}</div>
        {shows.map(show => {
          const budget = client.finance.budgets?.find(b => b.showId === show.id)
          const pnl = settledPnl(client, show, budget, fxRates)
          return (
            <div key={show.id} className="border border-gray-100 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 text-sm font-semibold">{show.venue} <span className="text-gray-400 font-normal">· {show.city} · {show.date}</span></div>
              {!pnl ? (
                <div className="px-3 py-2 text-xs text-gray-400">This show has no budget, so there is nothing to compare the settlement with. Create one under Budget to see the comparison.</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10px] font-bold uppercase tracking-widest text-gray-400 border-b border-gray-100">
                      <th className="text-left px-3 py-1.5">&nbsp;</th>
                      <th className="text-right px-3 py-1.5">Original</th><th className="text-right px-3 py-1.5">Current</th><th className="text-right px-3 py-1.5">Settled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROWS.map(r => (
                      <tr key={r.key} className={`border-b border-gray-50 ${r.strong ? 'font-semibold' : ''}`}>
                        <td className="px-3 py-1.5">{r.label}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-gray-400">{pnl.original ? money2(pnl.original[r.key], pnl.currency) : '—'}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{money2(pnl.current[r.key], pnl.currency)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{money2(pnl.settled[r.key], pnl.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {pnl && pnl.settled.soundLights + pnl.settled.production < pnl.current.soundLights + pnl.current.production - 0.5 && (
                <div className="px-3 py-2 text-xs bg-amber-50 text-amber-800">
                  Only {money2(pnl.settled.soundLights + pnl.settled.production, pnl.currency)} of the {money2(pnl.current.soundLights + pnl.current.production, pnl.currency)} budgeted costs
                  {' '}have been recorded against this show, so the Settled net may look better than it really is. Record the rest under Finance → Payments, or on the show&apos;s travel.
                </div>
              )}
            </div>
          )
        })}
        <div className="text-[11px] text-gray-400">
          Income is the settlement; costs are what you recorded against the show (travel and expenses), at the exchange rates frozen on {new Date(st.fx.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.
        </div>
      </div>

      {/* The itemized statement, folded */}
      <div className="space-y-2">
        <Fold title="Your payout, itemized" hint={`${st.payout.length} lines`}><PayoutTable payout={st.payout} totalDue={st.totalDue} currency={cur} /></Fold>
        {st.boxOffice.length > 0 && <Fold title="Ticket sales" hint={`${st.boxOffice.length} ticket types`}><TicketTable tiers={st.boxOffice} currency={cur} /></Fold>}
        {st.expenses.length > 0 && <Fold title="The promoter's costs" hint={`${st.expenses.length} lines`}><PromoterCosts expenses={st.expenses} currency={cur} /></Fold>}
        <Fold title="Checks" hint={problems > 0 ? `${problems} to look at` : 'all add up'} defaultOpen={problems > 0}><Checks settlement={st} currency={cur} /></Fold>
      </div>

      {/* Payments */}
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Payments</div>
        {st.payments.length === 0 && <div className="text-xs text-gray-400 mb-1.5">Nothing received yet.</div>}
        {st.payments.map((p, i) => (
          <div key={i} className="flex items-center text-sm py-0.5">
            <span>{p.label}{p.note && <span className="text-gray-400"> · {p.note}</span>}</span>
            <span className="ml-auto tabular-nums">{m(p.amount)}</span>
          </div>
        ))}
        {editable && balance > 0.005 && (
          <div className="flex items-center gap-2 mt-2">
            <input className={`${inputClass} flex-1`} value={pay.label} onChange={e => setPay({ ...pay, label: e.target.value })} />
            <input className={`${inputClass} !w-32 text-right`} inputMode="decimal" placeholder={String(Math.round(balance * 100) / 100)} value={pay.amount} onChange={e => setPay({ ...pay, amount: e.target.value })} />
            <button onClick={recordPayment} disabled={busy} className="px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Record payment</button>
          </div>
        )}
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>}
    </Modal>
  )
}
