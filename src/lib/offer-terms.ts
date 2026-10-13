// ──────────────────────────────────────────────────────────
//  Offer terms — helpers for the extra details an offer can carry
//  (see OfferTerms in types): what they add up to, how they read, and how the
//  form's text boxes turn into saved data and back.
// ──────────────────────────────────────────────────────────

import type { OfferBonus, OfferPayment, OfferTerms } from '@/types'

export const AGE_LIMITS = ['All ages', '18+', '21+']
export const BILLINGS = ['Headline', 'Direct support', 'Support', 'Festival set']

// ── Reading them ─────────────────────────────────────────────
// The most the deal can pay: the guarantee plus every ticket bonus.
export function maxPotential(guarantee: number, terms?: OfferTerms): number {
  return guarantee + (terms?.bonuses ?? []).reduce((sum, b) => sum + (b.amount || 0), 0)
}

// The payment schedule with each instalment worked out in dollars.
export function paymentAmounts(guarantee: number, terms?: OfferTerms): (OfferPayment & { amount: number })[] {
  return (terms?.payments ?? []).map(p => ({ ...p, amount: Math.round((guarantee * p.pct) / 100) }))
}

export const paymentsTotalPct = (payments?: OfferPayment[]) => (payments ?? []).reduce((sum, p) => sum + (p.pct || 0), 0)

// "00:30" -> "12:30 AM"
export function clock(hhmm?: string): string | undefined {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '')
  if (!m) return undefined
  const h = Number(m[1])
  return `${h % 12 || 12}:${m[2]} ${h >= 12 ? 'PM' : 'AM'}`
}

function addMinutes(hhmm: string, minutes: number): string | undefined {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!m) return undefined
  const total = (Number(m[1]) * 60 + Number(m[2]) + minutes) % (24 * 60)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// "12:30 AM – 2:00 AM (90 min)"
export function setTimeLabel(t?: OfferTerms): string | undefined {
  if (!t?.setStart && !t?.setLengthMin) return undefined
  const start = clock(t.setStart)
  const end = t.setStart && t.setLengthMin ? clock(addMinutes(t.setStart, t.setLengthMin)) : undefined
  const length = t.setLengthMin ? `${t.setLengthMin} min` : undefined
  if (start && end) return `${start} – ${end}${length ? ` (${length})` : ''}`
  return start ?? length
}

// "Bonus at 850 tickets" / "Bonus at sell-out (1,000 tickets)"
export function bonusLabel(b: OfferBonus, capacity?: number): string {
  const n = b.atTickets.toLocaleString('en-US')
  return capacity && b.atTickets >= capacity ? `Bonus at sell-out (${n} tickets)` : `Bonus at ${n} tickets`
}

export function radiusLabel(t?: OfferTerms): string | undefined {
  if (!t?.radiusMiles) return undefined
  const after = t.radiusDaysAfter ? `until ${t.radiusDaysAfter} days after the show` : 'on the show date'
  return `No other shows within ${t.radiusMiles} miles, from confirmation ${after}`
}

export function merchLabel(t?: OfferTerms): string | undefined {
  if (t?.merchArtistPct === undefined) return undefined
  const seller = t.merchSoldBy === 'artist' ? ' · artist sells' : t.merchSoldBy === 'venue' ? ' · venue sells' : ''
  return `Artist ${t.merchArtistPct}% / venue ${100 - t.merchArtistPct}%${seller}`
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000)
const shortDate = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// How urgent "reply by" is, for the badge on an offer card.
export function replyStatus(respondBy: string | undefined, today: string): { label: string; tone: 'late' | 'soon' | 'ok' } | undefined {
  if (!respondBy) return undefined
  const days = dayDiff(respondBy, today)
  if (days < 0) return { label: `Reply was due ${shortDate(respondBy)}`, tone: 'late' }
  if (days === 0) return { label: 'Reply due today', tone: 'soon' }
  return { label: `Reply by ${shortDate(respondBy)}`, tone: days <= 3 ? 'soon' : 'ok' }
}

// ── The form's text boxes <-> saved terms ────────────────────
export interface TermsDraft {
  capacity: string; ageLimit: string; venueType: string; billing: string
  doors: string; setStart: string; setLengthMin: string
  bonuses: { atTickets: string; amount: string }[]
  groundTransport: string; hotel: string; airfare: string
  merchArtistPct: string; merchSoldBy: string
  production: string; hospitality: string
  payments: { when: string; pct: string }[]
  radiusMiles: string; radiusDaysAfter: string
  routingNotes: string; alternativeDates: string; respondBy: string
}

export function draftFromTerms(t?: OfferTerms): TermsDraft {
  const s = (n?: number) => (n === undefined || n === null ? '' : String(n))
  return {
    capacity: s(t?.capacity), ageLimit: t?.ageLimit ?? '', venueType: t?.venueType ?? '', billing: t?.billing ?? '',
    doors: t?.doors ?? '', setStart: t?.setStart ?? '', setLengthMin: s(t?.setLengthMin),
    bonuses: (t?.bonuses ?? []).map(b => ({ atTickets: s(b.atTickets), amount: s(b.amount) })),
    groundTransport: s(t?.groundTransport), hotel: s(t?.hotel), airfare: s(t?.airfare),
    merchArtistPct: s(t?.merchArtistPct), merchSoldBy: t?.merchSoldBy ?? '',
    production: t?.production ?? '', hospitality: t?.hospitality ?? '',
    payments: (t?.payments ?? []).map(p => ({ when: p.when, pct: s(p.pct) })),
    radiusMiles: s(t?.radiusMiles), radiusDaysAfter: s(t?.radiusDaysAfter),
    routingNotes: t?.routingNotes ?? '', alternativeDates: t?.alternativeDates ?? '', respondBy: t?.respondBy ?? '',
  }
}

const num = (s: string): number | undefined => {
  if (s.trim() === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

// Keeps only what was filled in, so an offer with no extra terms saves no terms at all.
export function termsFromDraft(d: TermsDraft): OfferTerms | undefined {
  const text = (s: string) => (s.trim() === '' ? undefined : s.trim())
  const t: OfferTerms = {
    capacity: num(d.capacity), ageLimit: text(d.ageLimit), venueType: text(d.venueType), billing: text(d.billing),
    doors: text(d.doors), setStart: text(d.setStart), setLengthMin: num(d.setLengthMin),
    bonuses: d.bonuses
      .map(b => ({ atTickets: num(b.atTickets), amount: num(b.amount) }))
      .filter((b): b is OfferBonus => !!b.atTickets && !!b.amount),
    groundTransport: num(d.groundTransport), hotel: num(d.hotel), airfare: num(d.airfare),
    merchArtistPct: num(d.merchArtistPct),
    merchSoldBy: d.merchSoldBy === 'artist' || d.merchSoldBy === 'venue' ? d.merchSoldBy : undefined,
    production: text(d.production), hospitality: text(d.hospitality),
    payments: d.payments
      .map(p => ({ when: p.when.trim(), pct: num(p.pct) }))
      .filter((p): p is OfferPayment => p.when !== '' && !!p.pct),
    radiusMiles: num(d.radiusMiles), radiusDaysAfter: num(d.radiusDaysAfter),
    routingNotes: text(d.routingNotes), alternativeDates: text(d.alternativeDates), respondBy: text(d.respondBy),
  }
  // Drop empty values (and empty lists) so the saved JSON only holds real terms.
  const out = Object.fromEntries(
    Object.entries(t).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)),
  ) as OfferTerms
  return Object.keys(out).length > 0 ? out : undefined
}
