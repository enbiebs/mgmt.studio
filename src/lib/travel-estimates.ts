// ──────────────────────────────────────────────────────────
//  Travel estimates and booking prompts. Two honest sources for a budget's travel figures, plus the links that start a
//  booking:
//    • the artist's OWN past trips (the flights, hotels and ground costs already entered in Travel), worked out per person /
//      per room-night / per show, and
//    • (elsewhere, on the server) a web search — always labelled an estimate with its sources.
//  Nothing here books or pays for anything: a booking prompt is a search page opened with the trip already filled in, and a
//  to-do. Pure logic (no store, no screen, no network).
// ──────────────────────────────────────────────────────────

import type { BudgetAssumptions, Client, Currency, Show, TravelFlight, TravelHotel, TravelItem } from '@/types'
import { nightsBetween, type TravelKind } from '@/lib/budget-assumptions'
import { sameCity } from '@/lib/intelligence'
import { addDays } from '@/lib/utils'

/** What the web search is asked, and what comes back (US dollars): the same shapes on both sides of the network. */
export interface WebEstimateRequest { kind: TravelKind; from?: string; to: string; arrive: string; depart: string; travelers: number; rooms: number }
export interface WebEstimate { low: number; typical: number; high: number; notes: string; sources: { title: string; url: string }[]; asOf: string }

export interface HistoryEstimate { amount: number; low: number; high: number; samples: number; note: string }
export interface HistoryContext { to: string; from?: string; currency: Currency; convert: (amount: number, from: string, to: string) => number }

const r2 = (n: number) => Math.round(n * 100) / 100
export function median(nums: number[]): number {
  const s = nums.slice().sort((a, b) => a - b)
  if (s.length === 0) return 0
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
const spread = (nums: number[]) => ({ low: r2(Math.min(...nums)), high: r2(Math.max(...nums)) })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const live = (t: TravelItem) => t.status !== 'cancelled'

/** How many people a flight booking covers, or null when it cannot be told ("Full Party" with no names). */
function flightPeople(f: TravelFlight): number | null {
  if (f.personIds && f.personIds.length > 0) return f.personIds.length
  const seats = Number(f.seats)
  if (Number.isInteger(seats) && seats > 0 && seats < 30) return seats
  const who = (f.traveler ?? '').trim()
  return who && !/full party|band|crew|team|group|everyone/i.test(who) ? 1 : null
}

// ── Flights ──
function flightEstimate(client: Client, ctx: HistoryContext): HistoryEstimate | null {
  const roundTrips: number[] = [], into: number[] = [], out: number[] = []
  for (const t of client.tour.travel) {
    if (t.kind !== 'flight' || !live(t) || !t.cost || t.cost <= 0 || t.legs.length === 0) continue
    const n = flightPeople(t)
    if (!n) continue
    const first = t.legs[0], last = t.legs[t.legs.length - 1]
    const origin = first.fromCity ?? '', dest = last.toCity ?? ''
    const perPerson = ctx.convert(t.cost / n, t.currency ?? 'USD', ctx.currency)
    const touchesFrom = (city: string) => !!city && sameCity(city, ctx.to)
    if (origin && dest && sameCity(origin, dest) && t.legs.some(l => l.toCity && touchesFrom(l.toCity))) roundTrips.push(perPerson)   // there and back on one booking
    else if (touchesFrom(dest)) into.push(perPerson)
    else if (touchesFrom(origin)) out.push(perPerson)
  }
  if (roundTrips.length > 0) {
    return { amount: r2(median(roundTrips)), ...spread(roundTrips), samples: roundTrips.length, note: `Based on ${plural(roundTrips.length, 'round-trip booking')} to ${ctx.to} in your own travel records` }
  }
  if (into.length > 0) {
    const inbound = median(into), outbound = out.length > 0 ? median(out) : inbound
    const all = [...into, ...out]
    return {
      amount: r2(inbound + outbound), low: r2(spread(all).low * 2), high: r2(spread(all).high * 2), samples: all.length,
      note: `Based on ${plural(all.length, 'one-way flight')} ${out.length > 0 ? 'to and from' : 'to'} ${ctx.to} in your own travel records${out.length > 0 ? '' : ', doubled for the trip home'}`,
    }
  }
  return null
}

// ── Hotels ──
const showsInCity = (client: Client, city: string): Show[] => client.tour.shows.filter(s => !!s.city && sameCity(s.city, city))

function hotelEstimate(client: Client, ctx: HistoryContext): HistoryEstimate | null {
  const cityShowIds = new Set(showsInCity(client, ctx.to).map(s => s.id))
  const plain = ctx.to.split(',')[0].trim().toLowerCase()
  const perNight: number[] = []
  for (const t of client.tour.travel) {
    if (t.kind !== 'hotel' || !live(t) || !t.cost || t.cost <= 0) continue
    const h = t as TravelHotel
    const nights = nightsBetween(h.checkIn?.slice(0, 10), h.checkOut?.slice(0, 10))
    if (nights <= 0) continue
    const inCity = (h.showIds ?? []).some(id => cityShowIds.has(id)) || (!!plain && !!h.address && h.address.toLowerCase().includes(plain))
    if (!inCity) continue
    perNight.push(ctx.convert(h.cost! / nights / Math.max(1, h.roomCount ?? 1), h.currency ?? 'USD', ctx.currency))
  }
  if (perNight.length === 0) return null
  return { amount: r2(median(perNight)), ...spread(perNight), samples: perNight.length, note: `Based on ${plural(perNight.length, 'hotel stay')} in ${ctx.to} in your own travel records` }
}

// ── Ground ──
function groundEstimate(client: Client, ctx: HistoryContext): HistoryEstimate | null {
  const cityShows = showsInCity(client, ctx.to)
  if (cityShows.length === 0) return null
  const perShow: number[] = []
  for (const s of cityShows) {
    let total = 0
    for (const t of client.tour.travel) {
      if (t.kind !== 'ground' || !live(t) || !t.cost || t.cost <= 0 || !(t.showIds ?? []).includes(s.id)) continue
      total += ctx.convert(t.cost / (t.showIds ?? []).length, t.currency ?? 'USD', ctx.currency)   // a cost shared by several shows counts a share of itself
    }
    if (total > 0) perShow.push(total)
  }
  if (perShow.length === 0) return null
  return { amount: r2(median(perShow)), ...spread(perShow), samples: perShow.length, note: `Based on ground costs for ${plural(perShow.length, 'past show')} in ${ctx.to} in your own travel records` }
}

/** The estimate the artist's own past trips give for one kind of travel to a city, or null when there is no history for it. */
export function historyEstimate(client: Client, kind: TravelKind, ctx: HistoryContext): HistoryEstimate | null {
  if (!ctx.to.trim()) return null
  return kind === 'flight' ? flightEstimate(client, ctx) : kind === 'hotel' ? hotelEstimate(client, ctx) : groundEstimate(client, ctx)
}

// ── Booking prompts ─────────────────────────────────────────────
export interface BookingLink { label: string; url: string }
const enc = encodeURIComponent
const ok = (s?: string) => !!s && s.trim().length > 0
const dateWord = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

/**
 * Search pages opened with the trip already filled in (a new tab, nothing booked or paid here). Empty when the trip does
 * not say enough yet: flights need where from, where to and the dates; hotels and cars need where and the dates.
 */
export function bookingLinks(kind: TravelKind, a: BudgetAssumptions): BookingLink[] {
  const to = a.to?.trim(), from = a.from?.trim()
  if (!ok(to) || !a.arrive || !a.depart) return []
  if (kind === 'flight') {
    if (!ok(from)) return []
    const q = `Flights from ${from} to ${to} on ${a.arrive} through ${a.depart} for ${a.travelers} ${a.travelers === 1 ? 'passenger' : 'passengers'}`
    return [{ label: 'Google Flights', url: `https://www.google.com/travel/flights?q=${enc(q)}` }]
  }
  if (kind === 'hotel') {
    const q = `Hotels in ${to} ${dateWord(a.arrive)} to ${dateWord(a.depart)} for ${a.rooms} ${a.rooms === 1 ? 'room' : 'rooms'}`
    return [
      { label: 'Google Hotels', url: `https://www.google.com/travel/search?q=${enc(q)}` },
      { label: 'Booking.com', url: `https://www.booking.com/searchresults.html?ss=${enc(to!)}&checkin=${a.arrive}&checkout=${a.depart}&group_adults=${Math.max(1, a.travelers)}&no_rooms=${Math.max(1, a.rooms)}` },
    ]
  }
  return [{ label: 'Kayak cars', url: `https://www.kayak.com/cars/${enc(to!)}/${a.arrive}/${a.depart}` }]
}

const TODO_WHAT: Record<TravelKind, string> = { flight: 'flights', hotel: 'hotels', ground: 'ground transport' }

/** The to-do a booking prompt adds: due a month before the trip, or in a few days if that has passed. */
export function bookingTodo(kind: TravelKind, a: BudgetAssumptions, estimateText: string | undefined, today: string): { title: string; dueDate: string; notes: string } {
  const route = kind === 'flight' && a.from ? `${a.from} → ${a.to}` : a.to ?? 'the trip'
  const when = a.arrive && a.depart ? `${dateWord(a.arrive)}–${dateWord(a.depart)}` : ''
  const due = a.arrive ? addDays(a.arrive, -30) : addDays(today, 3)
  return {
    title: `Book ${TODO_WHAT[kind]}: ${route}${when ? `, ${when}` : ''} (${a.travelers} ${a.travelers === 1 ? 'person' : 'people'})`,
    dueDate: due < today ? addDays(today, 3) : due,
    notes: estimateText ? `Budgeted: ${estimateText}` : 'Search with the links in the budget\'s assumptions, then enter the booking under Travel.',
  }
}
