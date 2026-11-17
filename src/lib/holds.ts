// ──────────────────────────────────────────────────────────
//  Holds on offers: a promoter keeps a date for us for a while. Pure logic (no store, no screen), covered by scripts/check-holds.ts.
//
//  A hold carries two optional facts, kept inside the offer's own terms (so no database change was needed):
//   · holdUntil    the last day the promoter keeps the date for us
//   · holdPosition where we stand when more than one promoter holds the same date (1 = first in line)
//
//  Nothing here ever changes a status on its own. A hold that has run out is flagged, not released: letting a date go is
//  a decision for a person. Only an offer that is still ON HOLD and not yet in the past counts as a live hold.
// ──────────────────────────────────────────────────────────

import type { OfferStatus, OfferTerms, TourOffer } from '@/types'

type HoldOffer = Pick<TourOffer, 'id' | 'status' | 'date' | 'terms'> & { venue?: string }

const DAY = 86_400_000
const diff = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY)
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const shortDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** A real calendar day written as YYYY-MM-DD. A typo like "20266-11-20" or "2026-02-30" is not one, and must never be counted as a hold date. */
export function isIsoDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = Date.parse(v + 'T00:00:00Z')
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v
}

/** The most places in line we ask about (nobody holds a date for a 7th promoter). */
export const MAX_POSITION = 6

/** "1st", "2nd", "3rd", "4th"... */
export function ordinal(n: number): string {
  const rest = n % 100
  if (rest >= 11 && rest <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/** A hold that still matters: the offer is on hold and its date has not passed. */
export function isLiveHold(o: Pick<TourOffer, 'status' | 'date'>, today: string): boolean {
  return o.status === 'hold' && o.date >= today
}

// ── how long is left ──
export interface HoldClock {
  /** What to say on the offer card. */
  label: string
  /** late = it has run out; soon = today or within 3 days; ok = more time; quiet = no end date was entered. */
  tone: 'late' | 'soon' | 'ok' | 'quiet'
  /** Days until the hold runs out (negative = it has), or null when no end date was entered. */
  daysLeft: number | null
}

export function holdClock(o: HoldOffer, today: string): HoldClock | undefined {
  if (!isLiveHold(o, today)) return undefined
  const until = o.terms?.holdUntil
  if (!isIsoDay(until)) return { label: 'No hold-until date', tone: 'quiet', daysLeft: null }
  const left = diff(until, today)
  if (left < 0) return { label: `Hold ran out ${shortDate(until)}`, tone: 'late', daysLeft: left }
  if (left === 0) return { label: 'Hold runs out today', tone: 'soon', daysLeft: 0 }
  return { label: `Held until ${shortDate(until)} (${plural(left, 'day')} left)`, tone: left <= 3 ? 'soon' : 'ok', daysLeft: left }
}

// ── who is first in line ──
export interface HoldPlace {
  /** Where this hold stands among the live holds on its date (1 = first). Holds that are not ranked come after the ranked ones. */
  rank: number
  /** How many live holds there are on this date. */
  of: number
  /** Did the person say where this one stands? */
  ranked: boolean
  /** Another hold on this date claims the same place. */
  tied: boolean
  /** The place the person chose (null when they did not rank it). */
  position: number | null
  /** They chose a place behind 1st while another live hold on the date is not ranked: that other one might really be ahead, so the place is a guess. */
  unsure: boolean
  /** The other live holds on this date (venue names), for "also held by". */
  others: string[]
}

/**
 * For every live hold that shares its date with another live hold: its place in line. A hold on a date by itself has no place to
 * speak of, so it is not in the result. Places are worked out from the holds that are still live, so when the first hold is
 * released or confirmed elsewhere, the second one moves up by itself (nothing stored has to change).
 */
export function holdPlaces(offers: readonly HoldOffer[], today: string): Map<string, HoldPlace> {
  const byDate = new Map<string, HoldOffer[]>()
  for (const o of offers) {
    if (!isLiveHold(o, today)) continue
    byDate.set(o.date, [...(byDate.get(o.date) ?? []), o])
  }
  const out = new Map<string, HoldPlace>()
  for (const group of byDate.values()) {
    if (group.length < 2) continue
    const key = (o: HoldOffer) => o.terms?.holdPosition ?? Number.POSITIVE_INFINITY
    for (const o of group) {
      const mine = key(o)
      out.set(o.id, {
        rank: 1 + group.filter(x => key(x) < mine).length,
        of: group.length,
        ranked: o.terms?.holdPosition !== undefined,
        tied: mine !== Number.POSITIVE_INFINITY && group.some(x => x !== o && key(x) === mine),
        position: o.terms?.holdPosition ?? null,
        unsure: mine !== Number.POSITIVE_INFINITY && mine > 1 && group.some(x => x !== o && x.terms?.holdPosition === undefined),
        others: group.filter(x => x !== o).map(x => x.venue ?? ''),
      })
    }
  }
  return out
}

/** The words for a place in line. */
export function placeLabel(p: HoldPlace): string {
  if (!p.ranked) return `Not ranked · ${p.of} holds on this date`
  if (p.tied) return `Tied for ${ordinal(p.rank)} hold`
  if (p.unsure && p.position !== null) return `Set as ${ordinal(p.position)} · another hold is not ranked yet`
  return `${ordinal(p.rank)} hold of ${p.of}`
}

/** How a place in line should look: first in line is calm, a tie, no ranking or a guess needs a decision, anything behind is quiet. */
export function placeTone(p: HoldPlace): 'first' | 'behind' | 'check' {
  if (!p.ranked || p.tied || p.unsure) return 'check'
  return p.rank === 1 ? 'first' : 'behind'
}

/** The other live holds on the same date as this one (or as a date being typed), for the "place in line" question on the form. */
export function otherHoldsOnDate(offers: readonly HoldOffer[], date: string, today: string, exceptId?: string): HoldOffer[] {
  return offers.filter(o => o.id !== exceptId && o.date === date && isLiveHold(o, today))
}

/** How the others already holding that date are placed, for the form's hint ("Echoplex is 1st, Fabric is not ranked"). */
export function othersLine(others: readonly HoldOffer[]): string {
  return others.map(o => `${o.venue || 'Another offer'} (${o.terms?.holdPosition !== undefined ? ordinal(o.terms.holdPosition) : 'not ranked'})`).join(', ')
}

// ── keeping the hold's details tidy ──
/** An offer that is not on hold carries no hold details: they would only go stale. */
export function withoutHoldDetails(terms: OfferTerms | undefined): OfferTerms | undefined {
  if (!terms || (terms.holdUntil === undefined && terms.holdPosition === undefined)) return terms
  const rest = { ...terms }
  delete rest.holdUntil
  delete rest.holdPosition
  return Object.keys(rest).length > 0 ? rest : undefined
}

/** The offer's terms as they should be saved for this status. */
export function termsForStatus(terms: OfferTerms | undefined, status: OfferStatus): OfferTerms | undefined {
  return status === 'hold' ? terms : withoutHoldDetails(terms)
}
