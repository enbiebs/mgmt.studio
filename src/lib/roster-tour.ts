// ──────────────────────────────────────────────────────────
//  "All artists" → Tour: every show in one table and every open booking offer on one board, across the artists a person can open.
//  Each show's "next step" is the same one its own page shows (lib/show-progress.ts), hidden where it would be worked out from
//  data the person cannot load: money steps need all of Finance, and nothing is worked out for a single shared show.
//  Fees and offers are Deals & fees, a separate page from Tour: someone with one and not the other sees only that part.
//  Pure logic (no store, no screen), covered by scripts/check-roster-tour.ts.
// ──────────────────────────────────────────────────────────

import type { Client, Currency, MainSection, UserRole } from '@/types'
import { daysUntil } from '@/lib/date-state'
import { progressForShow, type ProgressLink } from '@/lib/show-progress'
import { replyStatus } from '@/lib/offer-terms'
import { formatTotals, sumByCurrency } from '@/lib/money'

/**
 * What this person may open for ONE artist. "Fully" means the whole page, not just single items that were sent to them:
 * anything worked out from many rows (a next step, a total) needs it.
 */
export interface TourAccess { shows: boolean; showsFully: boolean; deals: boolean; dealsFully: boolean; finance: boolean }

/**
 * Reads the five flags from the access rules (`has` = may open at all, `shareOnly` = only single shared items, `role` = the
 * person's role for this artist's company). An artist's own login sees their schedule and nothing management works out from it:
 * no fees, no offers, no next steps (the rules say "yes" to most pages for the artist, so the role is checked here).
 */
export function tourAccessFor(
  has: (section: MainSection, clientId: string) => boolean,
  shareOnly: (section: MainSection, clientId: string) => boolean,
  clientId: string,
  role: UserRole,
): TourAccess {
  if (role === 'artist') return { shows: has('tour', clientId), showsFully: false, deals: false, dealsFully: false, finance: false }
  const full = (s: MainSection) => has(s, clientId) && !shareOnly(s, clientId)
  return { shows: has('tour', clientId), showsFully: full('tour'), deals: has('deals', clientId), dealsFully: full('deals'), finance: full('finance') }
}

/** played = it happened; lapsed = a hold whose date passed without being confirmed. */
export type ShowState = 'confirmed' | 'hold' | 'cancelled' | 'played' | 'lapsed'

export interface ShowRow {
  clientId: string; clientName: string; clientColor: string
  demo: boolean                                     // a practice artist: listed, but never counted in the totals
  showId: string; date: string; days: number; city: string; venue: string
  state: ShowState
  ahead: boolean                                    // still to come (a show kept only as history never is)
  fee?: { amount: number; currency: Currency }      // Deals & fees only
  next?: { label: string; link: ProgressLink }
  full: boolean                                     // the artist's whole Tour page is open to this person
}

export type OfferColumn = 'inquiry' | 'hold' | 'confirmed'
export const OFFER_COLUMNS: OfferColumn[] = ['inquiry', 'hold', 'confirmed']

export interface OfferCard {
  clientId: string; clientName: string; clientColor: string
  demo: boolean
  offerId: string; status: OfferColumn
  date: string; days: number; venue: string; city: string; promoter: string
  guarantee: number                                 // US dollars, as the offer form stores it
  viaAgency: boolean
  reply?: { label: string; tone: 'late' | 'soon' | 'ok' }
  datePassed: boolean                               // an inquiry or hold whose date has gone by
}

export interface RosterTourInput { client: Client; access: TourAccess }

// The steps that are about money: the invoice (in Finance) and the settlement.
const needsMoney = (go: ProgressLink) => go.section === 'finance' || go.sub === 'settlements'

function stateOf(show: Client['tour']['shows'][number], today: string): ShowState {
  if (show.status === 'cancelled') return 'cancelled'
  if (show.historyOnly) return 'played'
  if (show.date < today) return show.status === 'hold' ? 'lapsed' : 'played'
  return show.status === 'hold' ? 'hold' : 'confirmed'
}

const byDate = (a: { date: string; clientName: string }, b: { date: string; clientName: string }) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName)

export function buildRosterTour(inputs: readonly RosterTourInput[], today: string): { rows: ShowRow[]; offers: OfferCard[] } {
  const rows: ShowRow[] = []
  const offers: OfferCard[] = []

  for (const { client, access } of inputs) {
    const who = { clientId: client.id, clientName: client.name, clientColor: client.color, demo: !!client.isDemo }

    if (access.shows) {
      for (const show of client.tour.shows) {
        const state = stateOf(show, today)
        const progress = access.showsFully && !show.historyOnly ? progressForShow(client, show, today) : null
        const step = progress?.next && (access.finance || !needsMoney(progress.next.go)) ? progress.next : null
        rows.push({
          ...who, showId: show.id, date: show.date, days: daysUntil(show.date, today), city: show.city, venue: show.venue,
          state, ahead: !show.historyOnly && show.date >= today,
          ...(access.dealsFully && show.guarantee ? { fee: { amount: show.guarantee, currency: show.currency ?? 'USD' } } : {}),
          ...(step ? { next: { label: step.label, link: step.go } } : {}),
          full: access.showsFully,
        })
      }
    }

    if (access.deals) {
      for (const o of client.agentData?.offers ?? []) {
        if (!OFFER_COLUMNS.includes(o.status as OfferColumn)) continue
        const open = o.status !== 'confirmed'
        const reply = open ? replyStatus(o.terms?.respondBy, today) : undefined
        offers.push({
          ...who, offerId: o.id, status: o.status as OfferColumn,
          date: o.date, days: daysUntil(o.date, today), venue: o.venue, city: o.city, promoter: o.promoter,
          guarantee: o.guarantee, viaAgency: !!o.viaAgency,
          ...(reply ? { reply } : {}),
          datePassed: open && o.date < today,
        })
      }
    }
  }

  return { rows: rows.sort(byDate), offers: offers.sort(byDate) }
}

export type When = 'upcoming' | 'played' | 'all'

/** The rows to show: soonest first for what is ahead, most recent first for what has been played. */
export function filterRows(rows: readonly ShowRow[], opts: { when: When; clientId?: string }): ShowRow[] {
  const kept = rows.filter(r => (!opts.clientId || r.clientId === opts.clientId) && (opts.when === 'all' || (opts.when === 'upcoming') === r.ahead))
  return opts.when === 'played' ? kept.sort((a, b) => b.date.localeCompare(a.date) || a.clientName.localeCompare(b.clientName)) : kept.sort(byDate)
}

export interface TourStats {
  ahead: number          // shows still to come that are going to happen
  holds: number          // of those, still on hold
  openOffers: number     // inquiries and holds
  fees: string           // fees on confirmed shows ahead, one line per currency ("" when none can be shown)
}

/**
 * The numbers at the top. A count or total is worked out only from artists whose whole Tour page is open to this person
 * (someone sent a single show would get a number that looks like the artist's whole tour), and never from a practice artist.
 */
export function tourStats(rows: readonly ShowRow[], offers: readonly OfferCard[]): TourStats {
  const ahead = rows.filter(r => r.ahead && r.state !== 'cancelled' && r.full && !r.demo)
  const feeRows = ahead.filter(r => r.state === 'confirmed' && r.fee)
  return {
    ahead: ahead.length,
    holds: ahead.filter(r => r.state === 'hold').length,
    openOffers: offers.filter(o => o.status !== 'confirmed' && !o.demo).length,
    fees: formatTotals(sumByCurrency(feeRows, r => r.fee!.amount, r => r.fee!.currency)),
  }
}

/** What the page can offer this person across all their artists: the show table, the offer board, and the top counts. */
export function tourCapabilities(access: readonly TourAccess[]): { shows: boolean; offers: boolean; counts: boolean } {
  return { shows: access.some(a => a.shows), offers: access.some(a => a.deals), counts: access.some(a => a.showsFully) }
}
