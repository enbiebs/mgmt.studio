'use client'
// ──────────────────────────────────────────────────────────
//  ForecastView — Finance → Forecast: the money expected in and out of ONE artist over the next 90 days, week by week,
//  plus anything that was expected and has not arrived. Every figure is worked out by lib/forecast.ts from what is
//  already recorded; this screen only shows it and lets a person record that money arrived (or a bill was paid).
// ──────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { Badge } from '@/components/ui/Badge'
import { fmtAmount, scheduleByWeek, totalsByCurrency, undatedBills, windowTotals, type ForecastItem } from '@/lib/forecast'
import { useArtistForecast } from '@/lib/useForecast'
import { fromDateStr, today } from '@/lib/utils'
import type { BizSub, TourSub } from '@/types'

const HOLDS_KEY = 'mgmtpath-forecast-holds'

function useIncludeHolds(): [boolean, (v: boolean) => void] {
  // a per-browser convenience: if storage is unavailable the switch simply starts off (this screen only draws after the app has loaded)
  const [on, setOn] = useState(() => { try { return typeof window !== 'undefined' && localStorage.getItem(HOLDS_KEY) === '1' } catch { return false } })
  return [on, v => { setOn(v); try { localStorage.setItem(HOLDS_KEY, v ? '1' : '0') } catch { /* ignore */ } }]
}

const shortDate = (iso: string, day: string) =>
  fromDateStr(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(iso.slice(0, 4) !== day.slice(0, 4) ? { year: 'numeric' } : {}) })

const rangeLabel = (start: string, end: string, day: string) => `${shortDate(start, day)} – ${shortDate(end, day)}`

export function ForecastView() {
  const client = useStore(s => s.getClient())
  const clientId = useStore(s => s.clientId)
  const canEditFinance = useStore(s => s.canEdit('finance'))
  const canEditDeals = useStore(s => !!s.clientId && s.hasAccess('deals', s.clientId, true))
  const updateShowFinancials = useStore(s => s.updateShowFinancials)
  const updateInvoiceStatus = useStore(s => s.updateInvoiceStatus)
  const updateExpense = useStore(s => s.updateExpense)
  const addSettlementPayment = useStore(s => s.addSettlementPayment)
  const setSection = useStore(s => s.setSection)
  const setBizSub = useStore(s => s.setBizSub)
  const setTourSub = useStore(s => s.setTourSub)

  const [holds, setHolds] = useIncludeHolds()
  const items = useArtistForecast(holds)
  const day = today()

  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  const windows = useMemo(() => windowTotals(items, day), [items, day])
  const schedule = useMemo(() => scheduleByWeek(items, day), [items, day])
  const lateTotals = useMemo(() => totalsByCurrency(schedule.late), [schedule.late])
  // only the earliest open payment of a show can be marked received (received money is used up from the front)
  const markableInstallments = useMemo(() => {
    const first = new Set<string>()
    const seen = new Set<string>()
    for (const i of items) if (i.kind === 'installment' && i.showId && !seen.has(i.showId)) { seen.add(i.showId); first.add(i.id) }
    return first
  }, [items])
  const undated = client ? undatedBills(client) : { count: 0, byCurrency: {} }

  if (!client || !clientId) return null

  const canMark = (i: ForecastItem) =>
    i.kind === 'show' ? canEditDeals
      : i.kind === 'installment' ? canEditDeals && markableInstallments.has(i.id)
        : canEditFinance
  const verb = (i: ForecastItem) => (i.direction === 'out' ? 'Mark paid' : 'Mark received')

  function question(i: ForecastItem) {
    const amount = fmtAmount(i.amount, i.currency)
    if (i.kind === 'invoice') return `Mark this invoice as paid (${amount})?`
    if (i.kind === 'settlement') return `Record a payment of ${amount} on this settlement?`
    if (i.kind === 'bill') return `Mark this bill as paid (${amount})?`
    return `Record ${amount} as received toward this show's fee?`
  }

  async function record(i: ForecastItem) {
    setBusy(true); setProblem('')
    try {
      if (i.kind === 'invoice' && i.invoiceId) updateInvoiceStatus(i.invoiceId, 'paid')
      else if (i.kind === 'bill' && i.expenseId) updateExpense(i.expenseId, { paid: true })
      else if (i.kind === 'settlement' && i.settlementId) {
        const res = await addSettlementPayment(i.settlementId, { label: 'Payment received', amount: i.amount })
        if (!res.ok) throw new Error(res.error)
      } else if ((i.kind === 'show' || i.kind === 'installment') && i.showId) {
        const show = client?.tour.shows.find(s => s.id === i.showId)
        updateShowFinancials(i.showId, { received: Math.round(((show?.received ?? 0) + i.amount) * 100) / 100 })
      }
      setConfirmId(null)
    } catch (e) {
      console.error(e)
      setProblem(e instanceof Error && e.message ? e.message : 'That could not be saved. Please try again.')
    } finally { setBusy(false) }
  }

  function openTarget(go: ForecastItem['go']) {
    setSection(go.section)
    if (go.section === 'finance' && go.sub) setBizSub(go.sub as BizSub)
    if (go.section === 'tour' && go.sub) setTourSub(go.sub as TourSub)
  }

  // a plain function (not a component) so the rows keep their state when this screen re-renders
  const row = (item: ForecastItem) => {
    const asking = confirmId === item.id
    return (
      <div key={item.id} className="border-b border-gray-100 py-2.5 last:border-b-0">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <div className="w-16 flex-shrink-0 pt-0.5 text-xs font-medium text-gray-500">{shortDate(item.date, day)}</div>
          <div className="min-w-0 flex-1 basis-56">
            <div className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="font-medium">{item.title}</span>
              {item.estimated && <Badge variant="gray">Estimated date</Badge>}
              {item.tentative && <Badge variant="amber">Held, not confirmed</Badge>}
              {item.late && <Badge variant="red">{item.daysLate} {item.daysLate === 1 ? 'day' : 'days'} late</Badge>}
            </div>
            {item.detail && <div className="mt-0.5 text-xs text-gray-500">{item.detail}</div>}
          </div>
          <div className={`flex-shrink-0 text-right text-sm font-semibold tabular-nums ${item.direction === 'in' ? 'text-green-700' : 'text-gray-700'}`}>
            {item.direction === 'in' ? '+' : '−'}{fmtAmount(item.amount, item.currency)}
          </div>
          <div className="flex flex-shrink-0 gap-3 pt-0.5 text-[11px] font-medium">
            {canMark(item) && !asking && <button onClick={() => { setConfirmId(item.id); setProblem('') }} className="text-accent hover:underline">{verb(item)}</button>}
            <button onClick={() => openTarget(item.go)} className="text-gray-500 hover:text-gray-900">Open →</button>
          </div>
        </div>
        {asking && (
          <div role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p>{question(item)}</p>
            <div className="mt-2 flex gap-2">
              <button disabled={busy} onClick={() => void record(item)} className="rounded-lg bg-accent px-2.5 py-1 font-medium text-white hover:bg-accent-hover disabled:opacity-50">{busy ? 'Saving…' : 'Yes'}</button>
              <button onClick={() => setConfirmId(null)} className="rounded-lg border border-amber-200 px-2.5 py-1 font-medium hover:bg-amber-100">Cancel</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const empty = items.length === 0
  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-72">
            <h2 className="font-serif text-xl font-medium leading-tight">Cash forecast</h2>
            <p className="mt-1 text-sm text-gray-500">
              Money expected in and out for {client.name}, from confirmed shows, sent invoices, settlements and bills with a due date. Where an offer gives no payment schedule, a show&apos;s fee is assumed to arrive 30 days after the show.
            </p>
          </div>
          <label className="flex flex-shrink-0 items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" className="rounded" checked={holds} onChange={e => setHolds(e.target.checked)} />
            Include held dates (not confirmed)
          </label>
        </div>

        {problem && <p role="alert" className="mb-3 text-xs text-red-600">{problem}</p>}

        {empty ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-400">
            Nothing is expected yet. Money shows up here once a confirmed show has a fee, an invoice is sent, or a bill with a due date is entered.
            {!holds && <div className="mt-1 text-xs">Held dates are left out; turn on &ldquo;Include held dates&rdquo; to see them.</div>}
          </div>
        ) : (
          <>
            <section aria-label="Totals" className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {windows.map(w => (
                <div key={w.days} className="rounded-xl border border-gray-100 px-4 py-3">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Next {w.days} days</div>
                  {w.totals.length === 0 ? <div className="mt-1 text-sm text-gray-400">Nothing expected</div> : w.totals.map(t => (
                    <div key={t.currency} className="mt-1 text-sm tabular-nums">
                      <span className="font-semibold text-green-700">+{fmtAmount(t.in, t.currency)}</span>
                      {t.out > 0 && <span className="ml-2 text-gray-600">−{fmtAmount(t.out, t.currency)}</span>}
                      <span className="ml-2 text-xs text-gray-400">{t.currency}</span>
                    </div>
                  ))}
                </div>
              ))}
            </section>

            {schedule.late.length > 0 && (
              <section aria-label="Late" className="mb-6 rounded-xl border border-red-100 bg-red-50/40 px-4 py-3">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-red-700">Expected before today and not recorded</div>
                  <div className="text-xs tabular-nums text-red-700">
                    {lateTotals.map(t => `${t.in > 0 ? `+${fmtAmount(t.in, t.currency)}` : ''}${t.out > 0 ? ` −${fmtAmount(t.out, t.currency)}` : ''} ${t.currency}`).join(' · ')}
                  </div>
                </div>
                <p className="mb-1 text-xs text-gray-500">If it already arrived, record it so it drops off. If not, it may be time to chase.</p>
                {schedule.late.map(row)}
              </section>
            )}

            {schedule.weeks.filter(w => w.items.length > 0).map(w => (
              <section key={w.start} aria-label={`Week of ${w.start}`} className="mb-5">
                <div className="mb-1 flex items-baseline gap-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">
                  <span>{w.start === day ? 'This week' : rangeLabel(w.start, w.end, day)}</span>
                  {w.start === day && <span className="font-medium normal-case tracking-normal text-gray-400">{rangeLabel(w.start, w.end, day)}</span>}
                </div>
                <div className="rounded-xl border border-gray-100 px-4">{w.items.map(row)}</div>
              </section>
            ))}

            {schedule.later.length > 0 && (
              <section aria-label="Later" className="mb-5">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Later than 13 weeks out</div>
                <div className="rounded-xl border border-gray-100 px-4">{schedule.later.map(row)}</div>
              </section>
            )}
          </>
        )}

        {undated.count > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            {undated.count} unpaid {undated.count === 1 ? 'bill has' : 'bills have'} no due date, so {undated.count === 1 ? 'it is' : 'they are'} not in this forecast
            ({Object.entries(undated.byCurrency).map(([c, n]) => fmtAmount(n as number, c as 'USD' | 'EUR' | 'GBP')).join(', ')}).{' '}
            <button onClick={() => { setSection('finance'); setBizSub('payments') }} className="font-medium text-accent hover:underline">Add due dates →</button>
          </p>
        )}
        <p className="mt-2 text-[11px] text-gray-400">Different currencies are never added together. There is no running bank balance because no bank account is linked.</p>
      </div>
    </div>
  )
}
