// ──────────────────────────────────────────────────────────
//  Studio · Unified calendar aggregator
//
//  Pulls every forward-looking date already stored on a Client — shows,
//  release dates, content posts, invoice due dates, contract expiries,
//  project due dates — into one flat list for CalendarView. Nothing new
//  is stored here; this just reads the same fields every other view
//  already reads (client.tour.shows, client.songs.albums, etc.).
// ──────────────────────────────────────────────────────────

import type { Client, MainSection, UserRole } from '@/types'
import { dueState, eventState, type DateState } from '@/lib/date-state'
import { effectiveStatus } from '@/lib/contract-status'
import { today as todayStr } from '@/lib/utils'
import { invoiceStateWithDeposits } from '@/lib/money'

export type CalendarEventDomain = 'show' | 'release' | 'post' | 'invoice' | 'contract' | 'project' | 'bill' | 'offer'

// Which section's access grant gates seeing each domain's events — shared
// by CalendarView.tsx and any other consumer that needs to permission-check
// getCalendarEvents (e.g. ClientCard.tsx's dashboard stats).
export const DOMAIN_SECTION: Record<CalendarEventDomain, MainSection> = {
  show: 'tour', release: 'songs', post: 'content',
  invoice: 'finance', contract: 'legal', project: 'projects', bill: 'finance', offer: 'deals',
}

// Bills live in Finance, which the artist's own login can otherwise view -
// but bills are management-side only, so the artist never sees their dates.
// Offers are deal negotiations: the artist hears about one only through a sheet
// sent to them, which their portal shows as an "Offers" card, not on this calendar.
const MANAGEMENT_ONLY_DOMAINS: CalendarEventDomain[] = ['bill', 'offer']

// The one place that decides whether a viewer may see a domain's events;
// CalendarView and the roster cards both go through it.
export function canSeeCalendarDomain(
  domain: CalendarEventDomain,
  clientId: string,
  role: UserRole,
  hasAccess: (section: MainSection, clientId?: string) => boolean,
): boolean {
  if (role === 'artist' && MANAGEMENT_ONLY_DOMAINS.includes(domain)) return false
  return hasAccess(DOMAIN_SECTION[domain], clientId)
}

export interface CalendarEvent {
  id: string
  date: string
  domain: CalendarEventDomain
  title: string
  subtitle?: string
  showId?: string
  albumId?: string
  offerId?: string
  state: DateState       // upcoming / soon / overdue / done, worked out from the date (see date-state.ts)
  cancelled?: boolean    // a cancelled show stays on the calendar, struck through, and is never counted as upcoming
}

export function getCalendarEvents(
  client: Client,
  canSee: (domain: CalendarEventDomain) => boolean,
  today: string = todayStr(),
): CalendarEvent[] {
  const events: CalendarEvent[] = []

  if (canSee('show')) {
    for (const s of client.tour.shows) {
      const cancelled = s.status === 'cancelled'
      events.push({ id: `show-${s.id}`, date: s.date, domain: 'show', title: s.venue, subtitle: s.city, showId: s.id, cancelled, state: cancelled ? 'done' : eventState(s.date, today) })
    }
  }

  if (canSee('release')) {
    for (const a of client.songs.albums) {
      if (!a.releaseDate) continue
      events.push({ id: `release-${a.id}`, date: a.releaseDate, domain: 'release', title: a.title, subtitle: 'Release', albumId: a.id, state: eventState(a.releaseDate, today) })
    }
  }

  if (canSee('post')) {
    for (const p of client.content.posts) {
      events.push({ id: `post-${p.id}`, date: p.date, domain: 'post', title: p.title, subtitle: p.time, state: eventState(p.date, today) })
    }
  }

  if (canSee('invoice')) {
    const deposits = client.business?.banking?.deposits ?? []
    for (const i of client.finance.invoices) {
      if (i.status !== 'sent' && i.status !== 'overdue') continue
      if (invoiceStateWithDeposits(i, today, deposits) === 'paid') continue        // its deposits cover it: nothing is due
      events.push({ id: `invoice-${i.id}`, date: i.dueDate, domain: 'invoice', title: `Invoice due — ${i.to}`, subtitle: i.number, state: dueState(i.dueDate, today) })
    }
  }

  if (canSee('contract')) {
    for (const c of client.legal.contracts) {
      // Only a signed contract has a real end date to watch: a draft or one still being negotiated does not "expire".
      if (!c.expiryDate || (c.status !== 'signed' && c.status !== 'expired')) continue
      const ended = effectiveStatus(c, today) === 'expired'
      events.push({ id: `contract-${c.id}`, date: c.expiryDate, domain: 'contract', title: `${c.title} ${ended ? 'expired' : 'expires'}`, subtitle: c.counterparty, state: dueState(c.expiryDate, today) })
    }
  }

  if (canSee('project')) {
    for (const p of client.projects) {
      if (!p.dueDate || p.status === 'done') continue
      events.push({ id: `project-${p.id}`, date: p.dueDate, domain: 'project', title: p.title, subtitle: 'Project due', state: dueState(p.dueDate, today) })
    }
  }

  if (canSee('bill')) {
    for (const e of client.finance.expenses) {
      if (!e.dueDate || e.paid) continue
      events.push({
        id: `bill-${e.id}`, date: e.dueDate, domain: 'bill',
        title: `Bill due — ${e.vendor}`,
        subtitle: `${e.currency} ${e.amount.toLocaleString()}${e.billNumber ? ` · ${e.billNumber}` : ''}`,
        state: dueState(e.dueDate, today),
      })
    }
  }

  // Open offers: on the calendar the moment they come in. A confirmed offer is a
  // show by then, so it's left out rather than shown twice.
  if (canSee('offer')) {
    const offerIdsWithShow = new Set(client.tour.shows.map(s => s.tourOfferId).filter(Boolean))
    for (const o of client.agentData?.offers ?? []) {
      if ((o.status !== 'inquiry' && o.status !== 'hold') || o.showId || offerIdsWithShow.has(o.id)) continue
      events.push({
        id: `offer-${o.id}`, date: o.date, domain: 'offer', title: o.venue,
        subtitle: `${o.status === 'hold' ? 'Hold' : 'Inquiry'} · ${o.city}`, offerId: o.id,
        state: eventState(o.date, today),     // an open offer for a date that has passed just fades; chasing it is the inbox's job
      })
    }
  }

  return events
}

export const CALENDAR_DOMAIN_LABEL: Record<CalendarEventDomain, string> = {
  show: 'Shows', release: 'Releases', post: 'Posts',
  invoice: 'Invoices', contract: 'Contracts', project: 'Projects', bill: 'Bills', offer: 'Offers',
}

export const CALENDAR_DOMAIN_STYLE: Record<CalendarEventDomain, string> = {
  show:     'bg-blue-50 border-blue-400 text-blue-700',
  release:  'bg-purple-50 border-purple-400 text-purple-700',
  post:     'bg-pink-50 border-pink-400 text-pink-700',
  invoice:  'bg-amber-50 border-amber-400 text-amber-700',
  contract: 'bg-red-50 border-red-400 text-red-600',
  project:  'bg-green-50 border-green-400 text-green-700',
  bill:     'bg-orange-50 border-orange-400 text-orange-700',
  offer:    'bg-teal-50 border-teal-400 text-teal-700',
}
