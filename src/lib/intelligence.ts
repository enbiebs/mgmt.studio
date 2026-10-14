// ──────────────────────────────────────────────────────────
//  Offer intelligence — the context a manager normally digs for before answering an offer:
//    - what else is booked on, and around, that date;
//    - what this artist has been paid in that city and at that venue before.
//
//  Everything here is worked out from the artist's own records (shows, offers). Nothing is
//  guessed or looked up elsewhere, and it never reaches across artists, so it can only ever show
//  what the viewer already may see.
// ──────────────────────────────────────────────────────────

import type { Client, Currency, Show } from '@/types'
import { makeConverter, type FxRates } from '@/lib/budget'

const DAY = 86_400_000
export const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / DAY)

// ── Matching places by name ──────────────────────────────────
const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Country names people type -> the short form used elsewhere in the calendar ("Berlin, DE").
const REGION_ALIAS: Record<string, string> = {
  'united kingdom': 'uk', 'great britain': 'uk', gb: 'uk', england: 'uk', scotland: 'uk', wales: 'uk', 'northern ireland': 'uk',
  'united states': 'us', 'united states of america': 'us', usa: 'us',
  germany: 'de', deutschland: 'de', france: 'fr', netherlands: 'nl', 'the netherlands': 'nl', holland: 'nl',
  spain: 'es', italy: 'it', belgium: 'be', austria: 'at', switzerland: 'ch', sweden: 'se', norway: 'no', denmark: 'dk',
  finland: 'fi', ireland: 'ie', portugal: 'pt', poland: 'pl', czechia: 'cz', 'czech republic': 'cz', hungary: 'hu',
  australia: 'au', 'new zealand': 'nz', japan: 'jp', mexico: 'mx', canada: 'ca', brazil: 'br',
}

export function placeKey(city: string): { name: string; region: string } {
  const parts = city.split(',').map(plain).filter(Boolean)
  const name = parts[0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1] : ''
  return { name, region: REGION_ALIAS[last] ?? last }
}

/** "Jacksonville, FL" and "Jacksonville" match; "Portland, OR" and "Portland, ME" do not. */
export function sameCity(a: string, b: string): boolean {
  const x = placeKey(a), y = placeKey(b)
  return !!x.name && x.name === y.name && (!x.region || !y.region || x.region === y.region)
}

const venueKey = (v: string) => plain(v).replace(/^the /, '')
export function sameVenue(a: string, b: string): boolean {
  const x = venueKey(a), y = venueKey(b)
  if (!x || !y) return false
  return x === y || (x.length >= 5 && y.length >= 5 && (x.includes(y) || y.includes(x)))
}

// ── What else is booked ──────────────────────────────────────
export interface Booking {
  key: string
  date: string
  venue: string
  city: string
  kind: 'show' | 'offer'
  status: string                 // confirmed / hold / inquiry
}

export interface Exclude { offerId?: string; showId?: string }

/** Every date held for the artist, shows and open offers, each deal counted once. */
export function bookingsOf(client: Client, exclude: Exclude = {}): Booking[] {
  const out: Booking[] = []
  const showIds = new Set(client.tour.shows.map(s => s.id))
  for (const s of client.tour.shows) {
    if (s.status === 'cancelled' || s.id === exclude.showId) continue
    out.push({ key: `show:${s.id}`, date: s.date, venue: s.venue, city: s.city, kind: 'show', status: s.status })
  }
  for (const o of client.agentData?.offers ?? []) {
    if (o.id === exclude.offerId) continue
    if (o.status !== 'inquiry' && o.status !== 'hold' && o.status !== 'confirmed') continue
    // An offer that already became a show is that show; don't list the deal twice.
    if (o.showId && (showIds.has(o.showId) || o.showId === exclude.showId)) continue
    out.push({ key: `offer:${o.id}`, date: o.date, venue: o.venue, city: o.city, kind: 'offer', status: o.status })
  }
  return out
}

export interface Conflicts {
  sameDay: Booking[]
  nearby: (Booking & { gap: number })[]       // gap: negative = before, positive = after
}

export function conflictsFor(all: Booking[], date: string, window = 3): Conflicts {
  const sameDay = all.filter(b => b.date === date)
  const nearby = all
    .map(b => ({ ...b, gap: dayDiff(b.date, date) }))
    .filter(b => b.gap !== 0 && Math.abs(b.gap) <= window)
    .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap) || a.gap - b.gap)
  return { sameDay, nearby }
}

// ── What this artist was paid before ─────────────────────────
export interface FeePoint {
  showId: string
  date: string
  venue: string
  city: string
  fee: number                     // in the artist's home currency
  original: number
  currency: Currency
  upcoming: boolean
}

export interface FeeStats { count: number; min: number; median: number; max: number; last: FeePoint }

export function summarize(points: FeePoint[]): FeeStats | null {
  if (points.length === 0) return null
  const fees = points.map(p => p.fee).sort((a, b) => a - b)
  const mid = Math.floor(fees.length / 2)
  const median = fees.length % 2 ? fees[mid] : Math.round((fees[mid - 1] + fees[mid]) / 2)
  const last = [...points].sort((a, b) => b.date.localeCompare(a.date)).find(p => !p.upcoming) ?? [...points].sort((a, b) => b.date.localeCompare(a.date))[0]
  return { count: points.length, min: fees[0], median, max: fees[fees.length - 1], last }
}

export interface History {
  inCity: FeePoint[]
  atVenue: FeePoint[]
  missingRates: string[]
}

/** Confirmed shows with a fee, in this city and at this venue. A show's own offer is left out. */
export function feeHistory(
  client: Client, where: { city: string; venue: string }, rates: FxRates, home: Currency, todayIso: string, exclude: Exclude = {},
): History {
  const { convert, missing } = makeConverter(rates)
  const point = (s: Show): FeePoint => ({
    showId: s.id, date: s.date, venue: s.venue, city: s.city,
    fee: Math.round(convert(s.guarantee ?? 0, s.currency ?? 'USD', home)), original: s.guarantee ?? 0, currency: s.currency ?? 'USD',
    upcoming: s.date >= todayIso,
  })
  const played = client.tour.shows.filter(s => s.status === 'confirmed' && (s.guarantee ?? 0) > 0 && s.id !== exclude.showId)
  const inCity = where.city.trim() ? played.filter(s => sameCity(s.city, where.city)).map(point) : []
  const atVenue = where.venue.trim()
    ? played.filter(s => sameVenue(s.venue, where.venue) && (!where.city.trim() || !s.city.trim() || sameCity(s.city, where.city))).map(point)
    : []
  return { inCity, atVenue, missingRates: [...missing] }
}

/** How a fee compares with what was paid before, as a signed percentage (null when there is no history). */
export function vsMedian(current: number, stats: FeeStats | null): number | null {
  if (!stats || stats.median <= 0 || current <= 0) return null
  return Math.round(((current - stats.median) / stats.median) * 100)
}
