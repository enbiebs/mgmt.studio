// ──────────────────────────────────────────────────────────
//  Calendar clash warnings: the same artist on two shows the same day, or a hold / open offer asking for a day that already has a
//  confirmed show. Pure logic (no store, no screen), covered by scripts/check-calendar-clashes.ts. Only today and later are
//  checked (a clash in the past is history), and a cancelled show never counts. Two holds on one day are normal (that is what a
//  hold is: keeping a date while the promoters decide), so they are not flagged.
// ──────────────────────────────────────────────────────────

import type { ShowStatus } from '@/types'

/** The part of a calendar date this needs; a calendar event fits it as it is. */
export interface ClashEvent {
  id: string
  date: string
  domain: string
  title: string
  status?: ShowStatus
  cancelled?: boolean
  /** A show that already happened and is only kept for fee comparisons: never a clash (the same rule every other screen uses). */
  historyOnly?: boolean
  clientId?: string
  clientName?: string
}

/** double: two or more confirmed shows. hold: a hold on a booked day. offer: an open offer for a booked day. */
export type ClashKind = 'double' | 'hold' | 'offer'

export interface Clash {
  kind: ClashKind
  date: string
  clientId?: string
  clientName?: string
  /** Every date involved, for marking them on the calendar. */
  ids: string[]
  /** What is on the day: the confirmed shows, the holds, and the open offers (each by venue). */
  booked: string[]
  holds: string[]
  offers: string[]
}

/** One clash per artist per day, named for the worst of what is wrong there. */
export function findClashes(events: readonly ClashEvent[], today: string): Clash[] {
  const days = new Map<string, ClashEvent[]>()
  for (const e of events) {
    if (e.date < today || e.cancelled || e.historyOnly) continue
    if (e.domain === 'show' && e.status === 'cancelled') continue
    const key = `${e.clientId ?? ''}|${e.date}`
    days.set(key, [...(days.get(key) ?? []), e])
  }
  const out: Clash[] = []
  for (const list of days.values()) {
    const booked = list.filter(e => e.domain === 'show' && e.status !== 'hold')
    const holds = list.filter(e => e.domain === 'show' && e.status === 'hold')
    const offers = list.filter(e => e.domain === 'offer')
    const kind: ClashKind | null = booked.length >= 2 ? 'double' : booked.length === 1 && holds.length > 0 ? 'hold' : booked.length === 1 && offers.length > 0 ? 'offer' : null
    if (!kind) continue
    const involved = [...booked, ...holds, ...offers]
    out.push({ kind, date: list[0].date, clientId: list[0].clientId, clientName: list[0].clientName, ids: involved.map(e => e.id), booked: booked.map(e => e.title), holds: holds.map(e => e.title), offers: offers.map(e => e.title) })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.clientName ?? '').localeCompare(b.clientName ?? ''))
}

const and = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** One plain sentence for a clash. `dateLabel` is the date as the screen writes it ("Fri, Nov 6"). */
export function clashLine(c: Clash, dateLabel: string): string {
  const who = c.clientName ? `${c.clientName}: ` : ''
  const hold = c.holds.length > 0 ? `a hold at ${and(c.holds)}` : ''
  const offer = c.offers.length > 0 ? `an open offer at ${and(c.offers)}` : ''
  const also = (...parts: string[]) => parts.filter(Boolean).join(' and ')
  if (c.kind === 'double') {
    const extra = also(hold, offer)
    return `${who}${c.booked.length} shows on ${dateLabel} (${and(c.booked)})${extra ? `, plus ${extra}` : ''}`
  }
  const extra = c.kind === 'hold' ? offer : hold
  return `${who}${c.kind === 'hold' ? hold : offer} on ${dateLabel}, which already has a show at ${and(c.booked)}${extra ? `, plus ${extra}` : ''}`
}
