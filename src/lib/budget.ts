// ──────────────────────────────────────────────────────────
//  Studio · Tour budgets (Finance Stage 4)
//
//  Pure calculation + template helpers, modeled on Eli's example budget:
//    Income → Sound & Lights → Production costs → Commissions → Net
//  where every commission has its own % and its own base (gross income, income
//  after sound & lights, or income after production costs) - or a flat amount.
//
//  "Actual" comes from real costs already in the app: travel costs and expenses,
//  assigned to specific show(s) (split evenly), to a whole run (shared evenly
//  across its shows), or to nothing (not counted against any show).
// ──────────────────────────────────────────────────────────

import type {
  Budget, BudgetBucket, BudgetCommission, BudgetLine, BudgetSection, BudgetSnapshot, Client,
  CommissionBase, CrewMember, CrewRate, Currency, ExpenseCategory, FinanceSettings, Person, Show, TourOffer,
} from '@/types'
import { uid } from '@/lib/utils'

export const BUCKET_LABEL: Record<BudgetBucket, string> = {
  guarantee: 'Guarantee',
  overage: 'Overage',
  sound_lights: 'Sound & lights',
  labor: 'Labor',
  filming_editing: 'Filming & editing',
  social_content: 'Social media & content',
  airfare: 'Travel — airfare',
  hotels: 'Travel — hotels',
  local_transport: 'Travel — local trans / rentals',
  insurance: 'Insurance',
  payroll_taxes: 'Payroll taxes & fees',
  per_diems: 'Per diems',
  supplies: 'Supplies / contingency',
}

export const BUCKET_SECTION: Record<BudgetBucket, BudgetSection> = {
  guarantee: 'income', overage: 'income', sound_lights: 'sound_lights',
  labor: 'production', filming_editing: 'production', social_content: 'production', airfare: 'production',
  hotels: 'production', local_transport: 'production', insurance: 'production', payroll_taxes: 'production',
  per_diems: 'production', supplies: 'production',
}

export const PRODUCTION_BUCKETS: BudgetBucket[] = [
  'labor', 'filming_editing', 'social_content', 'airfare', 'hotels', 'local_transport',
  'insurance', 'payroll_taxes', 'per_diems', 'supplies',
]

export const COMMISSION_BASE_LABEL: Record<CommissionBase, string> = {
  gross: 'of gross income',
  after_sound_lights: 'of income after sound & lights',
  after_production: 'of income after production costs',
  flat: 'flat amount',
}

export const DEFAULT_COMMISSIONS: FinanceSettings['defaultCommissions'] = [
  { label: 'Agent', pct: 10, base: 'gross' },
  { label: 'Management', pct: 15, base: 'after_production' },
  { label: 'Biz mgmt', pct: 4, base: 'after_sound_lights' },
]

export function financeSettings(c: Client): FinanceSettings {
  return c.finance.settings ?? { homeCurrency: 'USD', defaultCommissions: DEFAULT_COMMISSIONS }
}

// Where an expense's cost lands when it wasn't given a specific budget line.
export function categoryBucket(category: ExpenseCategory): BudgetBucket {
  switch (category) {
    case 'travel': return 'local_transport'
    case 'marketing': return 'social_content'
    case 'equipment': return 'sound_lights'
    case 'meals': return 'per_diems'
    default: return 'supplies'
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

// ── Crew pay ─────────────────────────────────────────────────
const ROLE_SHORT: Record<string, string> = {
  'tour-manager': 'TM', 'production-manager': 'PM', foh: 'FOH', monitors: 'MON', lighting: 'LD',
  video: 'VJ', backline: 'BACKLINE', merch: 'MERCH', security: 'SECURITY', driver: 'DRIVER', artist: 'ARTIST', other: 'CREW',
}
export const crewRoleShort = (role: string) => ROLE_SHORT[role] ?? role.toUpperCase()

export type CrewDays = { advance: number; travel: number; show: number }

// Per show: one fee per show day. Per day: show days at the show rate, advance
// days at the advance rate (else the travel rate, else the show rate), travel
// days at the travel rate (else the show rate).
export function crewLineAmount(rate: CrewRate, days: CrewDays): number {
  if (rate.rateUnit === 'show') return round2(rate.rateShow * days.show)
  const travel = rate.rateTravel ?? rate.rateShow
  const advance = rate.rateAdvance ?? travel
  return round2(rate.rateShow * days.show + advance * days.advance + travel * days.travel)
}

export const crewPerDiem = (rate: CrewRate, days: CrewDays) =>
  round2(rate.perDiem * (days.advance + days.travel + days.show))

// ── Calculation (the waterfall) ──────────────────────────────
export interface BudgetTotals {
  gross: number
  soundLights: number
  adjustedAfterSL: number
  production: number
  adjustedAfterProduction: number
  commissions: Record<string, number>
  totalCommissions: number
  net: number
}

export function commissionAmount(c: BudgetCommission, base: { gross: number; afterSL: number; afterProduction: number }): number {
  if (c.base === 'flat') return c.flat ?? 0
  const b = c.base === 'gross' ? base.gross : c.base === 'after_sound_lights' ? base.afterSL : base.afterProduction
  return (b * c.pct) / 100
}

export function computeBudget(lines: BudgetLine[], commissions: BudgetCommission[]): BudgetTotals {
  const sum = (section: BudgetSection) => lines.filter(l => l.section === section).reduce((a, l) => a + (l.amount || 0), 0)
  const gross = sum('income')
  const soundLights = sum('sound_lights')
  const adjustedAfterSL = gross - soundLights
  const production = sum('production')
  const adjustedAfterProduction = adjustedAfterSL - production
  const byId: Record<string, number> = {}
  let totalCommissions = 0
  for (const c of commissions) {
    const amt = commissionAmount(c, { gross, afterSL: adjustedAfterSL, afterProduction: adjustedAfterProduction })
    byId[c.id] = amt
    totalCommissions += amt
  }
  return { gross, soundLights, adjustedAfterSL, production, adjustedAfterProduction, commissions: byId, totalCommissions, net: adjustedAfterProduction - totalCommissions }
}

export const pctOfGross = (amount: number, gross: number) => (gross > 0 ? (amount / gross) * 100 : 0)

export function snapshotOf(b: Pick<Budget, 'lines' | 'commissions' | 'currency' | 'version'>): BudgetSnapshot {
  return JSON.parse(JSON.stringify({ lines: b.lines, commissions: b.commissions, currency: b.currency, version: b.version }))
}

// ── A new budget, from the defaults ──────────────────────────
export const newLine = (bucket: BudgetBucket, label: string, amount = 0, extra: Partial<BudgetLine> = {}): BudgetLine =>
  ({ id: 'bl-' + uid(), section: BUCKET_SECTION[bucket], bucket, label, amount, ...extra })

export const newCommission = (c: Omit<BudgetCommission, 'id'>): BudgetCommission => ({ id: 'bc-' + uid(), ...c })

export function buildNewBudget(args: {
  client: Client
  offer?: TourOffer
  show?: Show
}): Omit<Budget, 'id'> {
  const { client, offer, show } = args
  const settings = financeSettings(client)
  const guarantee = offer?.guarantee ?? show?.guarantee ?? 0
  const currency: Currency = show?.currency ?? settings.homeCurrency

  const peopleById = new Map<string, Person>(client.people.map(p => [p.id, p]))
  const crewById = new Map<string, CrewMember>(client.tour.crew.map(m => [m.id, m]))
  const touring = client.finance.crewRates.filter(r => r.toursWithArtist && crewById.has(r.crewMemberId))

  // Default assumption: one advance day and one show day each (edit per budget).
  const days: CrewDays = { advance: 1, travel: 0, show: 1 }
  const labor = touring.map(r => {
    const m = crewById.get(r.crewMemberId)!
    const name = peopleById.get(m.personId)?.name ?? 'Crew'
    return newLine('labor', `Labor — ${crewRoleShort(m.role)} (${name})`, crewLineAmount(r, days), { crewMemberId: r.crewMemberId, days })
  })
  const perDiemTotal = touring.reduce((a, r) => a + crewPerDiem(r, days), 0)

  const lines: BudgetLine[] = [
    newLine('guarantee', 'Guarantee', guarantee),
    newLine('overage', 'Overage', 0),
    newLine('sound_lights', 'Sound & lights', 0),
    ...labor,
    newLine('filming_editing', 'Filming & editing'),
    newLine('social_content', 'Social media & content'),
    newLine('airfare', 'Travel — airfare'),
    newLine('hotels', 'Travel — hotels'),
    newLine('local_transport', 'Travel — local trans / rentals'),
    newLine('insurance', 'Insurance'),
    newLine('payroll_taxes', 'Payroll taxes & fees'),
    newLine('per_diems', 'Per diems', perDiemTotal),
    newLine('supplies', 'Supplies / contingency'),
  ]

  return {
    offerId: offer?.id,
    showId: show?.id,
    name: offer ? `${offer.venue}, ${offer.city}` : show ? `${show.venue}, ${show.city}` : 'Budget',
    currency,
    status: 'draft',
    version: 1,
    lines,
    commissions: settings.defaultCommissions.map(newCommission),
  }
}

// ── Currency conversion ──────────────────────────────────────
// rates: currency → how many USD one unit is worth (USD itself = 1).
export type FxRates = Record<string, number>

export function makeConverter(rates: FxRates) {
  const missing = new Set<string>()
  const rate = (cur: string) => {
    if (cur === 'USD') return 1
    const r = rates[cur]
    if (!r) { missing.add(cur); return 1 }
    return r
  }
  return {
    // Falls back to 1:1 (and records the currency) if a rate isn't available.
    convert: (amount: number, from: string, to: string) => (from === to ? amount : (amount * rate(from)) / rate(to)),
    missing,
  }
}

// ── Actuals: real costs assigned to a show ───────────────────
// How much of a cost belongs to a show: 1/N if it names N specific shows
// (when this is one of them); otherwise, if it's a whole-run cost, an equal
// share of the run's shows; otherwise nothing.
export function costWeight(item: { showIds?: string[]; runId?: string }, show: Show, runShowCount: number): number {
  if (item.showIds && item.showIds.length > 0) return item.showIds.includes(show.id) ? 1 / item.showIds.length : 0
  if (item.runId && show.runId === item.runId && runShowCount > 0) return 1 / runShowCount
  return 0
}

export function actualCostsForShow(
  client: Client, show: Show, toCurrency: Currency, rates: FxRates,
): { byBucket: Partial<Record<BudgetBucket, number>>; missingRates: string[] } {
  const { convert, missing } = makeConverter(rates)
  const runShowCount = show.runId ? client.tour.shows.filter(s => s.runId === show.runId).length : 0
  const out: Partial<Record<BudgetBucket, number>> = {}
  const add = (bucket: BudgetBucket, amount: number) => { out[bucket] = (out[bucket] ?? 0) + amount }

  for (const t of client.tour.travel) {
    if (!t.cost) continue
    const w = costWeight(t, show, runShowCount)
    if (w === 0) continue
    const bucket: BudgetBucket = t.kind === 'flight' ? 'airfare' : t.kind === 'hotel' ? 'hotels' : 'local_transport'
    add(bucket, convert(t.cost * w, t.currency ?? 'USD', toCurrency))
  }
  for (const e of client.finance.expenses) {
    const w = costWeight(e, show, runShowCount)
    if (w === 0) continue
    add(e.bucket ?? categoryBucket(e.category), convert(e.amount * w, e.currency, toCurrency))
  }
  return { byBucket: out, missingRates: [...missing] }
}

// Add up the "actual" amount for each budget line: costs in a bucket are
// attributed to that bucket's first line so nothing is double counted.
export function actualByLine(lines: BudgetLine[], byBucket: Partial<Record<BudgetBucket, number>>): Record<string, number> {
  const out: Record<string, number> = {}
  const seen = new Set<BudgetBucket>()
  for (const l of lines) {
    if (l.section === 'income') continue
    if (seen.has(l.bucket)) { out[l.id] = 0; continue }
    seen.add(l.bucket)
    out[l.id] = byBucket[l.bucket] ?? 0
  }
  return out
}

// ── Per-show money figures, in the artist's home currency (for lists and run roll-ups) ──
export interface ShowFigures {
  gross: number
  budgetCosts: number | null   // sound & lights + production, Current
  actualCosts: number
  netCurrent: number | null    // Current budget's net after commissions
  netActual: number            // net after commissions using the real costs so far
}

export function showFigures(client: Client, show: Show, budget: Budget | undefined, home: Currency, rates: FxRates): ShowFigures {
  const { convert } = makeConverter(rates)
  const sumActual = (byBucket: Partial<Record<BudgetBucket, number>>) => Object.values(byBucket).reduce((a, v) => a + (v ?? 0), 0)

  if (!budget) {
    const actual = actualCostsForShow(client, show, home, rates)
    const gross = convert(show.guarantee ?? 0, show.currency ?? home, home)
    const actualCosts = sumActual(actual.byBucket)
    return { gross, budgetCosts: null, actualCosts, netCurrent: null, netActual: gross - actualCosts }
  }

  const cur = budget.currency
  const now = computeBudget(budget.lines, budget.commissions)
  const actual = actualCostsForShow(client, show, cur, rates)
  const actualLines: BudgetLine[] = [
    ...budget.lines.filter(l => l.section === 'income'),
    ...Object.entries(actual.byBucket).map(([bucket, amount]) => newLine(bucket as BudgetBucket, bucket, amount ?? 0)),
  ]
  const afterActual = computeBudget(actualLines, budget.commissions)
  return {
    gross: convert(now.gross, cur, home),
    budgetCosts: convert(now.soundLights + now.production, cur, home),
    actualCosts: convert(sumActual(actual.byBucket), cur, home),
    netCurrent: convert(now.net, cur, home),
    netActual: convert(afterActual.net, cur, home),
  }
}
