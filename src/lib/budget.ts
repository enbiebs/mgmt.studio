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
  CommissionBase, CrewMember, CrewRate, Currency, ExpenseCategory, FinanceSettings, PayoutKind, Settlement, Show, TourOffer,
} from '@/types'
import { uid } from '@/lib/utils'

export const BUCKET_LABEL: Record<BudgetBucket, string> = {
  guarantee: 'Guarantee',
  overage: 'Overage',
  bonus: 'Bonuses',
  buyout: 'Production buyouts',
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
  guarantee: 'income', overage: 'income', bonus: 'income', buyout: 'income', sound_lights: 'sound_lights',
  labor: 'production', filming_editing: 'production', social_content: 'production', airfare: 'production',
  hotels: 'production', local_transport: 'production', insurance: 'production', payroll_taxes: 'production',
  per_diems: 'production', supplies: 'production',
}

export const INCOME_BUCKETS: BudgetBucket[] = ['guarantee', 'overage', 'bonus', 'buyout']

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
  // No commission is charged on a loss: a show whose costs exceed its income must not turn the commission into extra money for the artist.
  return (Math.max(0, b) * c.pct) / 100
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

// ── Crew fees that follow the person ─────────────────────────
/** What a new crew line assumes: one advance day and one show day (edit per budget). */
export const DEFAULT_CREW_DAYS: CrewDays = { advance: 1, travel: 0, show: 1 }

/** A budget line for one crew member, worked out from their saved pay. */
export function crewLineFor(client: Client, member: CrewMember, rate: CrewRate): BudgetLine {
  const name = client.people.find(p => p.id === member.personId)?.name ?? 'Crew'
  const days: CrewDays = { ...DEFAULT_CREW_DAYS }
  return newLine('labor', `Labor — ${crewRoleShort(member.role)} (${name})`, crewLineAmount(rate, days), { crewMemberId: member.id, days })
}

/**
 * Adds the fee of a crew member who "tours with the artist" to a budget that doesn't have them yet, and
 * adds their per diems to the per-diem line. Only a draft budget for a show or offer that hasn't happened
 * is touched (a locked budget is a record of what was agreed). Returns the new lines, or null when there
 * is nothing to add.
 */
export function addMissingCrewFees(client: Client, budget: Budget, today: string, onlyMemberId?: string): AddedCrewFees | null {
  if (budget.status !== 'draft') return null
  const date = (budget.showId ? client.tour.shows.find(s => s.id === budget.showId)?.date : undefined)
    ?? (budget.offerId ? client.agentData?.offers.find(o => o.id === budget.offerId)?.date : undefined)
  if (date && date < today) return null
  const crewById = new Map<string, CrewMember>(client.tour.crew.map(m => [m.id, m]))
  const missing = client.finance.crewRates.filter(r =>
    r.toursWithArtist && crewById.has(r.crewMemberId) && (!onlyMemberId || r.crewMemberId === onlyMemberId) &&
    !budget.lines.some(l => l.crewMemberId === r.crewMemberId))
  if (missing.length === 0) return null
  const added = missing.map(r => crewLineFor(client, crewById.get(r.crewMemberId)!, r))
  const perDiemAdded = round2(missing.reduce((a, r) => a + crewPerDiem(r, DEFAULT_CREW_DAYS), 0))
  // Per diems go onto the FIRST per-diem line only (a budget with two such lines must not count them twice).
  const perDiemLineId = perDiemAdded > 0 ? budget.lines.find(l => l.bucket === 'per_diems')?.id : undefined
  const lines = [...budget.lines, ...added].map(l => (l.id === perDiemLineId ? { ...l, amount: round2(l.amount + perDiemAdded) } : l))
  return { lines, added: added.map(l => l.label), addedIds: added.map(l => l.id), perDiemLineId, perDiemAdded: perDiemLineId ? perDiemAdded : 0 }
}

/** The result of adding crew fees to a budget: the new lines, what was added, and how to take exactly that back out. */
export interface AddedCrewFees {
  lines: BudgetLine[]
  added: string[]                 // labels, for the message
  addedIds: string[]              // the lines that were added
  perDiemLineId?: string          // the per-diem line that grew
  perDiemAdded: number            // by how much
}

/** The same budget with exactly those additions taken back out, leaving every later edit alone. */
export function withoutAddedCrewFees(lines: BudgetLine[], undo: Pick<AddedCrewFees, 'addedIds' | 'perDiemLineId' | 'perDiemAdded'>): BudgetLine[] {
  const gone = new Set(undo.addedIds)
  return lines.filter(l => !gone.has(l.id)).map(l => (l.id === undo.perDiemLineId ? { ...l, amount: round2(l.amount - undo.perDiemAdded) } : l))
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

  const crewById = new Map<string, CrewMember>(client.tour.crew.map(m => [m.id, m]))
  const touring = client.finance.crewRates.filter(r => r.toursWithArtist && crewById.has(r.crewMemberId))

  // Default assumption: one advance day and one show day each (edit per budget).
  const days: CrewDays = { ...DEFAULT_CREW_DAYS }
  const labor = touring.map(r => crewLineFor(client, crewById.get(r.crewMemberId)!, r))
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
    // Converted amounts are rounded to the cent, so 100 EUR is 110, not 110.00000000000001.
    convert: (amount: number, from: string, to: string) => (from === to ? amount : round2((amount * rate(from)) / rate(to))),
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

// ── Settlements: the real income, once the promoter's statement is in ──
export const settlementForShow = (client: Client, showId: string): Settlement | undefined =>
  (client.finance.settlements ?? []).find(s => s.showIds.includes(showId))

// A settled show is worked out at the exchange rates frozen when its settlement was confirmed.
export const frozenRates = (s: Settlement): FxRates => ({ USD: 1, EUR: s.fx.EUR, GBP: s.fx.GBP })

// Which budget income line each kind of payout line counts toward. (Deposits, withholding
// tax and deductions are not income: they are timing and money taken back out.)
const EARNING_BUCKET: Partial<Record<PayoutKind, BudgetBucket>> = {
  guarantee: 'guarantee', overage: 'overage', bonus: 'bonus', buyout: 'buyout', other_income: 'overage',
}
export const isEarning = (kind: PayoutKind) => EARNING_BUCKET[kind] !== undefined

// Everything earned on a settlement (the artist's income), in the settlement's own currency.
export const settlementEarned = (s: Settlement) =>
  s.payout.filter(l => isEarning(l.kind)).reduce((sum, l) => sum + l.amount, 0)

// Costs by budget bucket. When the show has been settled, the by-bucket totals also hold its
// settled INCOME (guarantee / overage / bonuses / production buyouts), and every conversion
// uses the rates frozen at settlement, so settled figures never drift.
export function actualCostsForShow(
  client: Client, show: Show, toCurrency: Currency, liveRates: FxRates,
): { byBucket: Partial<Record<BudgetBucket, number>>; missingRates: string[]; settlement?: Settlement } {
  const settlement = settlementForShow(client, show.id)
  const rates = settlement ? frozenRates(settlement) : liveRates
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
  if (settlement) {
    // One settlement can cover several shows (a two-night run on one statement): split evenly.
    const share = 1 / Math.max(1, settlement.showIds.length)
    for (const l of settlement.payout) {
      const bucket = EARNING_BUCKET[l.kind]
      if (bucket) add(bucket, convert(l.amount * share, settlement.currency, toCurrency))
      // Money taken off the payout for things bought (e.g. a ticket purchase) is a real cost.
      else if (l.kind === 'deduction') add('supplies', convert(-l.amount * share, settlement.currency, toCurrency))
    }
  }
  return { byBucket: out, missingRates: [...missing], settlement }
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
  gross: number                // the settled income if the show has been settled, otherwise the Current budget's
  budgetCosts: number | null   // sound & lights + production, Current
  actualCosts: number
  netCurrent: number | null    // Current budget's net after commissions
  netActual: number            // net after commissions using the real costs (and real income once settled)
  settled: boolean             // income and rates come from the show's settlement
}

// The budget as it really went: real costs by bucket, and income that stays at the budgeted amount until a settlement supplies the real one.
export function actualBudgetLines(budgetLines: BudgetLine[], byBucket: Partial<Record<BudgetBucket, number>>, settled: boolean): BudgetLine[] {
  return [
    ...(settled ? [] : budgetLines.filter(l => l.section === 'income')),
    ...Object.entries(byBucket).map(([bucket, amount]) => newLine(bucket as BudgetBucket, bucket, amount ?? 0)),
  ]
}

export function showFigures(client: Client, show: Show, budget: Budget | undefined, home: Currency, liveRates: FxRates): ShowFigures {
  const settlement = settlementForShow(client, show.id)
  const { convert } = makeConverter(settlement ? frozenRates(settlement) : liveRates)
  const sumWhere = (byBucket: Partial<Record<BudgetBucket, number>>, income: boolean) =>
    Object.entries(byBucket)
      .filter(([bucket]) => (BUCKET_SECTION[bucket as BudgetBucket] === 'income') === income)
      .reduce((a, [, v]) => a + (v ?? 0), 0)

  if (!budget) {
    const actual = actualCostsForShow(client, show, home, liveRates)
    const gross = settlement ? sumWhere(actual.byBucket, true) : convert(show.guarantee ?? 0, show.currency ?? home, home)
    const actualCosts = sumWhere(actual.byBucket, false)
    return { gross, budgetCosts: null, actualCosts, netCurrent: null, netActual: gross - actualCosts, settled: !!settlement }
  }

  const cur = budget.currency
  const now = computeBudget(budget.lines, budget.commissions)
  const actual = actualCostsForShow(client, show, cur, liveRates)
  // Once settled, the by-bucket totals already hold the real income; before that, income stays at Current.
  const afterActual = computeBudget(actualBudgetLines(budget.lines, actual.byBucket, !!settlement), budget.commissions)
  return {
    gross: convert(settlement ? afterActual.gross : now.gross, cur, home),
    budgetCosts: convert(now.soundLights + now.production, cur, home),
    actualCosts: convert(sumWhere(actual.byBucket, false), cur, home),
    netCurrent: convert(now.net, cur, home),
    netActual: convert(afterActual.net, cur, home),
    settled: !!settlement,
  }
}

// ── The settled P&L for one show: Original vs Current vs Settled ──
export interface PnlColumn { gross: number; soundLights: number; production: number; commissions: number; net: number }

const toColumn = (t: ReturnType<typeof computeBudget>): PnlColumn => ({
  gross: t.gross, soundLights: t.soundLights, production: t.production, commissions: t.totalCommissions, net: t.net,
})

// "Settled" uses the real income from the settlement and the real costs recorded against the
// show (travel + expenses), with commissions worked out by the budget's own rules - all at the
// exchange rates frozen when the settlement was confirmed. Returns null for a show with no budget.
export function settledPnl(client: Client, show: Show, budget: Budget | undefined, liveRates: FxRates) {
  if (!budget) return null
  const cur = budget.currency
  const actual = actualCostsForShow(client, show, cur, liveRates)
  const lines = actualBudgetLines(budget.lines, actual.byBucket, !!actual.settlement)
  return {
    currency: cur,
    original: budget.original ? toColumn(computeBudget(budget.original.lines, budget.original.commissions)) : null,
    current: toColumn(computeBudget(budget.lines, budget.commissions)),
    settled: toColumn(computeBudget(lines, budget.commissions)),
    missingRates: actual.missingRates,
  }
}
