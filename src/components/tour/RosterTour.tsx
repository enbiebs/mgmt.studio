'use client'
// ──────────────────────────────────────────────────────────
//  RosterTour — "All artists" → Tour: every show in one table and every open booking offer on one board.
//  Opening a row goes to that artist's own page: the show's next step when it has one, else the show. Read-only here:
//  nothing is edited from this page. What each person sees (fees, offers, next steps, totals) is decided in lib/roster-tour.ts.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { today, MONTH_NAMES } from '@/lib/utils'
import { dayWord, whenWord } from '@/lib/roster-summary'
import {
  OFFER_COLUMNS, buildRosterTour, filterRows, tourAccessFor, tourCapabilities, tourStats,
  type OfferCard, type OfferColumn, type ShowRow, type ShowState, type When,
} from '@/lib/roster-tour'
import { Badge } from '@/components/ui/Badge'
import { useRosterClients } from '@/components/layout/nav'
import { goShowStep } from '@/components/tour/progressNav'

const WHEN_LABEL: Record<When, string> = { upcoming: 'Upcoming', played: 'Past', all: 'All' }
const STATE: Record<ShowState, { label: string; variant: 'green' | 'amber' | 'red' | 'gray' }> = {
  confirmed: { label: 'Confirmed', variant: 'green' },
  hold:      { label: 'Hold', variant: 'amber' },
  cancelled: { label: 'Cancelled', variant: 'red' },
  played:    { label: 'Played', variant: 'gray' },
  lapsed:    { label: 'Hold passed', variant: 'amber' },
}
const COLUMN_LABEL: Record<OfferColumn, string> = { inquiry: 'Inquiry', hold: 'Hold', confirmed: 'Confirmed' }
const REPLY_TONE = { late: 'text-red-600', soon: 'text-amber-700', ok: 'text-gray-500' } as const
const PAGE = 150   // rows drawn at a time, so a long history (Played, All) stays quick

const SEGMENT = 'inline-flex p-0.5 bg-gray-100 rounded-lg text-xs font-medium'
const segment = (on: boolean) => `px-3 py-1 rounded-md transition-colors ${on ? 'bg-canvas shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`
const SELECT = 'px-2.5 py-1.5 text-xs bg-canvas border border-gray-200 rounded-lg text-gray-700 hover:border-gray-300 max-w-[180px]'
const DEMO_CHIP = 'text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 rounded-full px-1.5 flex-shrink-0'

const formatters = new Map<string, Intl.NumberFormat>()
function money(n: number, currency: string) {
  let f = formatters.get(currency)
  if (!f) { f = new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }); formatters.set(currency, f) }
  return f.format(n)
}
const monthLabel = (iso: string) => `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass bg-canvas border border-gray-100 rounded-2xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
      <div className="font-serif text-xl font-semibold leading-tight mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export function RosterTour() {
  const roster = useRosterClients()
  const hasAccess = useStore(s => s.hasAccess)
  const isShareOnly = useStore(s => s.isShareOnly)
  const roleFor = useStore(s => s.roleFor)
  const { openClient, setSection, setTourSub, setSelectedShow } = useStore()
  const [chosenView, setChosenView] = useState<'shows' | 'offers'>('shows')
  const [when, setWhen] = useState<When>('upcoming')
  const [clientId, setClientId] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const day = today()
  const inputs = roster.map(client => ({ client, access: tourAccessFor(hasAccess, isShareOnly, client.id, roleFor(client.id)) }))
  const caps = tourCapabilities(inputs.map(i => i.access))

  if (!caps.shows && !caps.offers) {
    return (
      <>
        <h1 className="font-serif text-[26px] font-medium leading-tight">Tour</h1>
        <p className="text-sm text-gray-400 mt-0.5">No artists with a tour page you can open yet.</p>
      </>
    )
  }

  const { rows, offers } = buildRosterTour(inputs, day)
  const stats = tourStats(rows, offers)
  // Both parts: the person picks (shows first). Only one: that one, with no toggle.
  const view = caps.shows && caps.offers ? chosenView : caps.offers ? 'offers' : 'shows'

  const people = [...new Map((view === 'shows' ? rows : offers).map(x => [x.clientId, x.clientName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const picked = people.some(([id]) => id === clientId) ? clientId : ''

  const shown = filterRows(rows, { when, clientId: picked || undefined })
  const drawn = shown.slice(0, limit)
  const hasFees = drawn.some(r => r.fee)
  const board = offers.filter(o => !picked || o.clientId === picked)

  // A show opens on its next step when it has one (the thing to do), else on the show itself.
  // (setSection() clears the selected show, so it runs before the show is selected.)
  const openShow = (r: ShowRow) => {
    openClient(r.clientId)
    if (r.next) { goShowStep(r.showId, r.next.link); return }
    setSection('tour'); setTourSub('tour'); setSelectedShow(r.showId)
  }
  const openOffer = (o: OfferCard) => { openClient(o.clientId); setSection('tour'); setTourSub('offers') }
  const pick = (w: When) => { setWhen(w); setLimit(PAGE) }

  // The table needs room, and the sidebar takes 232px, so it switches on at lg; below that each show is a card.
  const COLS = hasFees
    ? 'lg:grid-cols-[104px_minmax(0,1fr)_minmax(0,1.4fr)_112px_96px_minmax(0,1.2fr)]'
    : 'lg:grid-cols-[104px_minmax(0,1fr)_minmax(0,1.4fr)_112px_minmax(0,1.2fr)]'

  // A month heading above the first show of each month.
  const lines = drawn.map((r, i) => ({ r, heading: i === 0 || drawn[i - 1].date.slice(0, 7) !== r.date.slice(0, 7) ? monthLabel(r.date) : null }))

  return (
    <>
      <div className="mb-5">
        <h1 className="font-serif text-[26px] font-medium leading-tight">Tour</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Every show{caps.offers ? ' and booking offer' : ''} across your artists. Open one to go to that artist&apos;s page.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {caps.counts && <Stat label="Shows ahead" value={String(stats.ahead)} />}
        {caps.counts && <Stat label="On hold" value={String(stats.holds)} sub={stats.holds > 0 ? 'not yet confirmed' : undefined} />}
        {caps.offers && <Stat label="Open offers" value={String(stats.openOffers)} sub={stats.openOffers > 0 ? 'waiting on an answer' : undefined} />}
        {stats.fees && <Stat label="Fees ahead" value={stats.fees} sub="confirmed shows" />}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        {caps.shows && caps.offers && (
          <div role="group" aria-label="What to show" className={SEGMENT}>
            <button aria-pressed={view === 'shows'} onClick={() => setChosenView('shows')} className={segment(view === 'shows')}>Shows</button>
            <button aria-pressed={view === 'offers'} onClick={() => setChosenView('offers')} className={segment(view === 'offers')}>Offers</button>
          </div>
        )}
        {view === 'shows' && (
          <div role="group" aria-label="When" className={SEGMENT}>
            {(['upcoming', 'played', 'all'] as const).map(w => (
              <button key={w} aria-pressed={when === w} onClick={() => pick(w)} className={segment(when === w)}>{WHEN_LABEL[w]}</button>
            ))}
          </div>
        )}
        {people.length > 1 && (
          <select aria-label="Artist" value={picked} onChange={e => { setClientId(e.target.value); setLimit(PAGE) }} className={SELECT}>
            <option value="">All artists</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {view === 'shows' ? (
        shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400">
            {rows.length === 0 ? 'No shows yet. To add one, pick an artist with the switcher at the top left.' : when === 'upcoming' ? 'No shows ahead.' : when === 'played' ? 'No past shows yet.' : 'No shows.'}
          </p>
        ) : (
          <div className="glass bg-canvas border border-gray-100 rounded-2xl overflow-hidden">
            <div className={`hidden lg:grid ${COLS} gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/60 text-[10px] font-bold uppercase tracking-widest text-gray-400`}>
              <span>Date</span><span>Artist</span><span>Show</span><span>Status</span>{hasFees && <span className="text-right">Fee</span>}<span>Next step</span>
            </div>
            {lines.map(({ r, heading }) => {
              const st = STATE[r.state]
              return (
                <div key={`${r.clientId}:${r.showId}`} className="border-b border-gray-100 last:border-b-0">
                  {heading && <div className="px-4 py-1.5 bg-gray-50/60 text-[11px] font-semibold text-gray-500 border-b border-gray-100">{heading}</div>}
                  <button
                    onClick={() => openShow(r)}
                    className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors flex flex-wrap items-center gap-x-3 gap-y-1 lg:grid ${COLS} ${r.state === 'cancelled' ? 'opacity-60' : ''}`}
                  >
                    <span className="flex items-baseline gap-2 lg:block">
                      <span className={`text-sm font-semibold tabular-nums ${r.state === 'cancelled' ? 'line-through' : ''}`}>{dayWord(r.date)}</span>
                      <span className="text-xs text-gray-400 lg:block">{r.ahead ? whenWord(r.date, day) : r.date.slice(0, 4)}</span>
                    </span>
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.clientColor }} aria-hidden />
                      <span className="truncate text-sm font-medium">{r.clientName}</span>
                      {r.demo && <span className={DEMO_CHIP}>Demo</span>}
                    </span>
                    <span className="basis-full lg:basis-auto min-w-0 block">
                      <span className="block truncate text-sm">{r.city || r.venue}</span>
                      {r.city && r.venue && <span className="block truncate text-xs text-gray-400">{r.venue}</span>}
                    </span>
                    <span><Badge variant={st.variant}>{st.label}</Badge></span>
                    {hasFees && <span className="text-sm tabular-nums lg:text-right">{r.fee ? money(r.fee.amount, r.fee.currency) : ''}</span>}
                    <span className="basis-full lg:basis-auto min-w-0 block truncate text-xs text-gray-500">{r.next?.label ?? ''}</span>
                  </button>
                </div>
              )
            })}
            {shown.length > drawn.length && (
              <button onClick={() => setLimit(l => l + PAGE)} className="w-full px-4 py-2.5 text-xs font-medium text-accent hover:bg-gray-50 transition-colors">
                Show more ({shown.length - drawn.length} more)
              </button>
            )}
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {OFFER_COLUMNS.map(col => {
            const cards = board.filter(o => o.status === col)
            return (
              <section key={col} aria-label={COLUMN_LABEL[col]}>
                <div className="flex items-baseline gap-2 mb-2">
                  <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{COLUMN_LABEL[col]}</h2>
                  <span className="text-xs text-gray-400">{cards.length}</span>
                </div>
                <div className="flex flex-col gap-2">
                  {cards.length === 0 && <p className="text-xs text-gray-400 py-3">None</p>}
                  {cards.map(o => (
                    <button
                      key={`${o.clientId}:${o.offerId}`}
                      onClick={() => openOffer(o)}
                      className="glass bg-canvas border border-gray-100 rounded-2xl p-3.5 text-left hover:border-gray-200 hover:shadow-sm transition-all"
                    >
                      <span className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: o.clientColor }} aria-hidden />
                        <span className="truncate text-xs font-semibold text-gray-600">{o.clientName}</span>
                        {o.demo && <span className={DEMO_CHIP}>Demo</span>}
                        {o.viaAgency && <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-gray-400">Agency</span>}
                      </span>
                      <span className="block text-sm font-medium truncate">{o.city || o.venue}{o.city && o.venue ? ` · ${o.venue}` : ''}</span>
                      <span className="block text-xs text-gray-400 truncate">{o.promoter}</span>
                      <span className="flex items-baseline justify-between gap-2 mt-2">
                        <span className={`text-xs ${o.datePassed ? 'text-red-600 font-medium' : 'text-gray-500'}`}>{dayWord(o.date)}{o.datePassed ? ' · date passed' : o.days >= 0 ? ` · ${whenWord(o.date, day)}` : ''}</span>
                        <span className="text-sm font-semibold tabular-nums">{money(o.guarantee, 'USD')}</span>
                      </span>
                      {o.reply && <span className={`block mt-1 text-[11px] font-medium ${REPLY_TONE[o.reply.tone]}`}>{o.reply.label}</span>}
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}
