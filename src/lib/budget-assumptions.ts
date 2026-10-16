// ──────────────────────────────────────────────────────────
//  Budget assumptions — what makes a budget easy to build. A budget keeps a few plain assumptions (how many people
//  travel, from where, which nights, and an estimate for flights / hotels / ground) and works the travel lines out from
//  them. Whatever the promoter says it will cover is taken OFF that travel cost (never counted as income, so commission is
//  not charged on it). A line the person typed over is never touched. Pure logic (no store, no screen, no network).
// ──────────────────────────────────────────────────────────

import type { Budget, BudgetAssumptions, BudgetBucket, BudgetLine, BudgetLineCalc, Client, Currency, OfferTerms, Show, TourOffer } from '@/types'
import { BUCKET_LABEL, buildNewBudget, newLine } from '@/lib/budget'
import { addDays } from '@/lib/utils'

export type TravelKind = 'flight' | 'hotel' | 'ground'
export const TRAVEL_KINDS: TravelKind[] = ['flight', 'hotel', 'ground']
export const TRAVEL_BUCKET: Record<TravelKind, BudgetBucket> = { flight: 'airfare', hotel: 'hotels', ground: 'local_transport' }
export const TRAVEL_LABEL: Record<TravelKind, string> = { flight: 'Flights', hotel: 'Hotels', ground: 'Ground & local transport' }
/** What one figure means for each kind. */
export const TRAVEL_UNIT: Record<TravelKind, string> = { flight: 'per person, round trip', hotel: 'per room, per night', ground: 'for the whole trip' }

const DAY = 86_400_000
const r2 = (n: number) => Math.round(n * 100) / 100

/** Writes an amount in whole units of one currency ($2,200), for the wording of a travel line. */
export const currencyFormatter = (currency: Currency) => (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Math.round(amount))

/** Nights between two dates (0 when either is missing, or the stay is not after the arrival). */
export function nightsBetween(arrive?: string, depart?: string): number {
  if (!arrive || !depart) return 0
  const n = Math.round((Date.parse(depart + 'T00:00:00Z') - Date.parse(arrive + 'T00:00:00Z')) / DAY)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** The artist plus the crew set to tour with them: the people who fly and stay. */
export function touringParty(client: Client): number {
  const crew = new Set(client.tour.crew.map(m => m.id))
  return 1 + client.finance.crewRates.filter(r => r.toursWithArtist && crew.has(r.crewMemberId)).length
}

/** Starting assumptions for a budget: the touring party, one room each, in the day before and out the day after the show. */
export function defaultAssumptions(client: Client, show?: Pick<Show, 'date' | 'city'>, offer?: Pick<TourOffer, 'date' | 'city'>): BudgetAssumptions {
  const date = show?.date ?? offer?.date
  const city = (show?.city ?? offer?.city)?.trim()
  const travelers = touringParty(client)
  return { travelers, rooms: travelers, to: city || undefined, arrive: date ? addDays(date, -1) : undefined, depart: date ? addDays(date, 1) : undefined }
}

// ── What the promoter covers ───────────────────────────────────
export interface PromoterCovers { flight: number; hotel: number; ground: number }

/** The promoter's travel contributions from the offer (written in dollars on the offer), in the budget's currency. */
export function promoterCovers(terms: OfferTerms | undefined, convert: (amount: number, from: string, to: string) => number, currency: Currency): PromoterCovers {
  const c = (n?: number) => (n && n > 0 ? r2(convert(n, 'USD', currency)) : 0)
  return { flight: c(terms?.airfare), hotel: c(terms?.hotel), ground: c(terms?.groundTransport) }
}

// ── Working the travel lines out ───────────────────────────────
export interface TravelLine { kind: TravelKind; bucket: BudgetBucket; gross: number; promoterCovers: number; net: number; basis: string }

const people = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`

/**
 * The flight, hotel and ground cost the assumptions give. A kind with no estimate yet (or missing what it needs, such as
 * the nights for a hotel) is left out. `fmt` writes an amount in the budget's currency, so the wording stays readable.
 */
export function computeTravelLines(a: BudgetAssumptions, covers: PromoterCovers, fmt: (amount: number) => string): TravelLine[] {
  const out: TravelLine[] = []
  const add = (kind: TravelKind, gross: number, basis: string) => {
    const coveredBy = r2(Math.min(gross, covers[kind]))
    out.push({ kind, bucket: TRAVEL_BUCKET[kind], gross: r2(gross), promoterCovers: coveredBy, net: r2(gross - coveredBy), basis: coveredBy > 0 ? `${basis} − ${fmt(coveredBy)} the promoter covers` : basis })
  }
  if (a.flight && a.flight.amount > 0 && a.travelers > 0) add('flight', a.travelers * a.flight.amount, `${people(a.travelers)} × ${fmt(a.flight.amount)} round trip`)
  const nights = nightsBetween(a.arrive, a.depart)
  if (a.hotel && a.hotel.amount > 0 && a.rooms > 0 && nights > 0) add('hotel', a.rooms * nights * a.hotel.amount, `${a.rooms} ${a.rooms === 1 ? 'room' : 'rooms'} × ${nights} ${nights === 1 ? 'night' : 'nights'} × ${fmt(a.hotel.amount)}`)
  if (a.ground && a.ground.amount > 0) add('ground', a.ground.amount, 'Local transport for the trip')
  return out
}

export interface ApplyResult { lines: BudgetLine[]; applied: BudgetBucket[]; skipped: BudgetBucket[]; cleared: BudgetBucket[] }

/**
 * Writes the worked-out travel lines into the budget. It only ever changes a line that is already worked out (it has `calc`)
 * or is still 0; a figure someone typed is left alone and reported as skipped, unless that bucket is in `force`. A worked-out
 * line whose estimate has been removed goes back to 0.
 */
export function applyTravelLines(lines: BudgetLine[], computed: TravelLine[], opts: { force?: BudgetBucket[] } = {}): ApplyResult {
  const force = new Set(opts.force ?? [])
  const applied: BudgetBucket[] = []
  const skipped: BudgetBucket[] = []
  const cleared: BudgetBucket[] = []
  let next = lines    // only ever replaced (never edited in place), so an unchanged budget comes back as the very same list
  const calcOf = (c: TravelLine): BudgetLineCalc => ({ basis: c.basis, gross: c.gross, promoterCovers: c.promoterCovers })

  for (const kind of TRAVEL_KINDS) {
    const bucket = TRAVEL_BUCKET[kind]
    const c = computed.find(x => x.kind === kind)
    const at = next.findIndex(l => l.bucket === bucket && l.section === 'production')
    if (!c) {
      // the estimate is gone: a line that was worked out from it goes back to 0
      if (at >= 0 && next[at].calc) { next = next.map((l, i) => (i === at ? { ...l, amount: 0, calc: undefined } : l)); cleared.push(bucket) }
      continue
    }
    if (at < 0) { next = [...next, newLine(bucket, BUCKET_LABEL[bucket], c.net, { calc: calcOf(c) })]; applied.push(bucket); continue }
    const t = next[at]
    if (t.calc || t.amount === 0 || force.has(bucket)) {
      // already exactly what the assumptions give: leave it (and report nothing) so an unchanged budget stays unchanged
      if (t.amount === c.net && JSON.stringify(t.calc) === JSON.stringify(calcOf(c))) continue
      next = next.map((l, i) => (i === at ? { ...l, amount: c.net, calc: calcOf(c) } : l)); applied.push(bucket)
    } else skipped.push(bucket)
  }
  return { lines: next, applied, skipped, cleared }
}

// ── Offer terms ────────────────────────────────────────────────
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`

/** Income lines an offer's terms call for that the budget does not have yet: a production buyout, and a Bonuses line left at 0. */
export function termLines(offer: Pick<TourOffer, 'buyout' | 'terms'> | undefined, existing: BudgetLine[]): BudgetLine[] {
  const out: BudgetLine[] = []
  if (offer?.buyout && offer.buyout > 0 && !existing.some(l => l.bucket === 'buyout')) out.push(newLine('buyout', 'Production buyout', offer.buyout))
  const bonuses = offer?.terms?.bonuses ?? []
  if (bonuses.length > 0 && !existing.some(l => l.bucket === 'bonus')) {
    const total = bonuses.reduce((s, b) => s + (b.amount || 0), 0)
    // left at 0 on purpose: a ticket bonus is an upside, not money to plan around; the settlement fills in what was earned
    const label = bonuses.length === 1 ? `Bonuses (up to ${usd(total)} if ${bonuses[0].atTickets} tickets sell)` : `Bonuses (up to ${usd(total)} more if ticket targets are met)`
    out.push(newLine('bonus', label, 0))
  }
  return out
}

/** A new budget for an offer or show, with the offer's terms and starting assumptions already in it. */
export function buildBudgetFromOffer(args: { client: Client; offer?: TourOffer; show?: Show }): Omit<Budget, 'id'> {
  const base = buildNewBudget(args)
  return { ...base, lines: [...base.lines, ...termLines(args.offer, base.lines)], assumptions: defaultAssumptions(args.client, args.show, args.offer) }
}

export interface FillContext { convert: (amount: number, from: string, to: string) => number; fmt: (amount: number) => string }
export interface FillResult { patch: Pick<Budget, 'lines' | 'assumptions'> | null; added: string[]; skipped: BudgetBucket[] }

/**
 * "Fill in from the offer" for a budget that already exists: starting assumptions if it has none, the buyout and Bonuses
 * lines if missing, and the travel lines when estimates exist. Only lines still at 0 or worked out are touched, so a number
 * someone typed is never overwritten. `patch` is null when nothing would change.
 */
export function fillFromOffer(budget: Budget, client: Client, offer: TourOffer | undefined, show: Show | undefined, ctx: FillContext): FillResult {
  const added: string[] = []
  const a: BudgetAssumptions = budget.assumptions ? { ...budget.assumptions } : defaultAssumptions(client, show, offer)
  if (!budget.assumptions) added.push('starting assumptions')
  const date = show?.date ?? offer?.date
  if (!a.to && (show?.city ?? offer?.city)) a.to = (show?.city ?? offer?.city)?.trim()
  if (!a.arrive && date) a.arrive = addDays(date, -1)
  if (!a.depart && date) a.depart = addDays(date, 1)

  let lines = budget.lines
  for (const l of termLines(offer, lines)) { lines = [...lines, l]; added.push(l.bucket === 'buyout' ? 'the production buyout' : 'a Bonuses line') }

  const computed = computeTravelLines(a, promoterCovers(offer?.terms, ctx.convert, budget.currency), ctx.fmt)
  const res = applyTravelLines(lines, computed)
  for (const b of res.applied) added.push(BUCKET_LABEL[b].replace('Travel — ', '').toLowerCase())
  lines = res.lines

  const same = JSON.stringify(a) === JSON.stringify(budget.assumptions ?? null) && lines === budget.lines
  return { patch: same ? null : { lines, assumptions: a }, added, skipped: res.skipped }
}

/** One line that says what the assumptions are: "3 people · 2 nights · Los Angeles → Lisbon". */
export function assumptionsSummary(a: BudgetAssumptions | undefined): string {
  if (!a) return ''
  const nights = nightsBetween(a.arrive, a.depart)
  const route = a.from && a.to ? `${a.from} → ${a.to}` : a.to ?? ''
  return [people(a.travelers), nights > 0 ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : '', route].filter(Boolean).join(' · ')
}
