// ──────────────────────────────────────────────────────────
//  Offer sheets — what gets frozen into a sheet, and how sheets are read back.
//
//  A sheet is a snapshot of the offer + its budget at send time. The snapshot
//  only ever holds what its detail level allows (the artist can read the whole
//  row, so a "summary" sheet must not carry the line items at all).
// ──────────────────────────────────────────────────────────

import type {
  Budget, Client, Currency, OfferSheet, OfferSheetDetail, OfferSheetSnapshot, OfferSheetStatus, TourOffer,
} from '@/types'
import { computeBudget, COMMISSION_BASE_LABEL } from '@/lib/budget'
import { bonusLabel, clock, maxPotential, merchLabel, paymentAmounts, radiusLabel, setTimeLabel } from '@/lib/offer-terms'
import { today } from '@/lib/utils'

// ── Reading a saved sheet back ───────────────────────────────
export interface OfferSheetRow {
  id: string; offer_id: string; version: number; status: string; detail: string; message: string | null
  snapshot: OfferSheetSnapshot; sent_at: string; responded_at: string | null; response_note: string | null
}

export function rowToOfferSheet(r: OfferSheetRow): OfferSheet {
  return {
    id: r.id, offerId: r.offer_id, version: r.version, status: r.status as OfferSheetStatus,
    detail: r.detail as OfferSheetDetail, message: r.message ?? undefined, snapshot: r.snapshot,
    sentAt: r.sent_at, respondedAt: r.responded_at ?? undefined, responseNote: r.response_note ?? undefined,
  }
}

export function buildOfferSheetSnapshot(args: {
  client: Client; offer: TourOffer; budget: Budget; detail: OfferSheetDetail
}): OfferSheetSnapshot {
  const { client, offer, budget, detail } = args
  const t = computeBudget(budget.lines, budget.commissions)
  const snap: OfferSheetSnapshot = {
    artistName: client.name,
    currency: budget.currency,
    sentOn: today(),
    offer: {
      venue: offer.venue, city: offer.city, country: offer.country, date: offer.date, promoter: offer.promoter,
      guarantee: offer.guarantee, door: offer.door, buyout: offer.buyout, terms: offer.terms,
    },
    totals: { gross: t.gross, soundLights: t.soundLights, production: t.production, commissions: t.totalCommissions, net: t.net },
  }
  if (detail === 'full') {
    // Lines at zero would only clutter the sheet.
    snap.lines = budget.lines.filter(l => l.amount !== 0).map(l => ({ section: l.section, label: l.label, amount: l.amount }))
    snap.commissions = budget.commissions.map(c => ({
      label: c.label, pct: c.pct, base: c.base, ...(c.base === 'flat' ? { flat: c.flat ?? 0 } : {}), amount: t.commissions[c.id] ?? 0,
    }))
    if (budget.notes?.trim()) snap.budgetNotes = budget.notes.trim()
  }
  return snap
}

// The newest version of an offer's sheet, whatever happened to it.
export function latestSheet(sheets: OfferSheet[] | undefined, offerId: string): OfferSheet | undefined {
  let best: OfferSheet | undefined
  for (const s of sheets ?? []) if (s.offerId === offerId && (!best || s.version > best.version)) best = s
  return best
}

// Sheets the artist should see: the newest per offer, unless it was replaced or withdrawn.
export function sheetsForArtist(sheets: OfferSheet[] | undefined): OfferSheet[] {
  const out: OfferSheet[] = []
  for (const offerId of new Set((sheets ?? []).map(s => s.offerId))) {
    const s = latestSheet(sheets, offerId)
    if (s && (s.status === 'sent' || s.status === 'approved' || s.status === 'passed')) out.push(s)
  }
  return out.sort((a, b) => a.snapshot.offer.date.localeCompare(b.snapshot.offer.date))
}

export const SHEET_STATUS_LABEL: Record<OfferSheetStatus, string> = {
  sent: 'Waiting for artist',
  approved: 'Artist approved',
  passed: 'Artist passed',
  superseded: 'Replaced by a newer version',
  withdrawn: 'Withdrawn',
}

export const SHEET_STATUS_STYLE: Record<OfferSheetStatus, string> = {
  sent: 'bg-amber-50 text-amber-700',
  approved: 'bg-green-50 text-green-700',
  passed: 'bg-red-50 text-red-600',
  superseded: 'bg-gray-100 text-gray-500',
  withdrawn: 'bg-gray-100 text-gray-500',
}

export function money(amount: number, currency: Currency): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
}

export function longDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

export const sheetFileName = (s: OfferSheet) =>
  `Offer sheet - ${s.snapshot.offer.venue} - ${s.snapshot.offer.date} - V${s.version}.pdf`.replace(/[\\/:*?"<>|]/g, '')

// ── What a sheet shows (shared by the on-screen sheet and the PDF) ──
export interface SheetRow {
  kind: 'head' | 'line' | 'subtotal' | 'total' | 'net'
  label: string
  sub?: string        // e.g. "10% of gross income"
  amount?: number
  pct?: number        // of gross income
}

// The budget waterfall, in the same order as Eli's example budget:
// Income -> Sound & lights -> Production costs -> Commissions -> Net.
export function sheetRows(sn: OfferSheetSnapshot): SheetRow[] {
  const { totals: t } = sn
  const pct = (amount: number) => (t.gross > 0 ? (amount / t.gross) * 100 : undefined)
  const row = (kind: SheetRow['kind'], label: string, amount?: number, sub?: string): SheetRow =>
    ({ kind, label, sub, amount, pct: amount === undefined ? undefined : pct(amount) })

  const afterSL = t.gross - t.soundLights
  const afterProduction = afterSL - t.production

  if (!sn.lines || !sn.commissions) {
    // Summary: the five totals, nothing underneath them.
    return [
      row('line', 'Gross income', t.gross),
      row('line', 'Sound & lights', t.soundLights),
      row('line', 'Production costs', t.production),
      row('line', 'Commissions', t.commissions),
      row('net', 'Net income after commissions', t.net),
    ]
  }

  const rows: SheetRow[] = []
  const linesOf = (section: string) => sn.lines!.filter(l => l.section === section)
  const income = linesOf('income'), soundLights = linesOf('sound_lights'), production = linesOf('production')

  rows.push(row('head', 'Income'))
  for (const l of income) rows.push(row('line', l.label, l.amount))
  rows.push(row('total', 'Total gross income', t.gross))

  if (soundLights.length > 0) {
    rows.push(row('head', 'Sound & lights'))
    for (const l of soundLights) rows.push(row('line', l.label, l.amount))
    rows.push(row('total', 'Total sound & lights', t.soundLights))
    rows.push(row('subtotal', 'Adjusted income after sound & lights', afterSL))
  }

  if (production.length > 0) {
    rows.push(row('head', 'Production costs'))
    for (const l of production) rows.push(row('line', l.label, l.amount))
    rows.push(row('total', 'Total production costs', t.production))
    rows.push(row('subtotal', 'Adjusted income after production costs', afterProduction))
  }

  if (sn.commissions.length > 0) {
    rows.push(row('head', 'Commissions'))
    for (const c of sn.commissions) {
      const sub = c.base === 'flat' ? 'flat amount' : `${c.pct}% ${COMMISSION_BASE_LABEL[c.base]}`
      rows.push(row('line', c.label, c.amount, sub))
    }
    rows.push(row('total', 'Total commissions', t.commissions))
  }

  rows.push(row('net', 'Net income after commissions', t.net))
  return rows
}

// The deal terms, in groups: the show, the money, the payment schedule, the other
// terms, and what's needed to decide. A group with nothing in it is left out.
export interface DealGroup { title?: string; rows: [string, string][] }

export function dealGroups(sn: OfferSheetSnapshot): DealGroup[] {
  const o = sn.offer
  const t = o.terms
  const cur = (n: number) => money(n, sn.currency)
  const groups: DealGroup[] = []
  const add = (title: string | undefined, rows: ([string, string | undefined] | false)[]) => {
    const kept = rows.filter((r): r is [string, string] => !!r && !!r[1])
    if (kept.length > 0) groups.push({ title, rows: kept })
  }

  add(undefined, [
    ['Date', longDate(o.date)],
    ['Venue', t?.venueType ? `${o.venue} · ${t.venueType}` : o.venue],
    ['City', [o.city, o.country].filter(Boolean).join(', ')],
    ['Promoter', o.promoter],
    ['Billing', t?.billing],
    ['Capacity', [t?.capacity ? `${t.capacity.toLocaleString('en-US')} cap` : '', t?.ageLimit ?? ''].filter(Boolean).join(' · ')],
    ['Doors', clock(t?.doors)],
    ['Set', setTimeLabel(t)],
  ])

  const bonuses = t?.bonuses ?? []
  add('Money', [
    ['Guarantee', cur(o.guarantee)],
    ...bonuses.map((b): [string, string] => [bonusLabel(b, t?.capacity), cur(b.amount)]),
    bonuses.length > 0 && ['Most this deal can pay', cur(maxPotential(o.guarantee, t))],
    ['Door split', o.door ? `${o.door}%` : undefined],
    ['Buyout', o.buyout ? cur(o.buyout) : undefined],
    ['Ground transport', t?.groundTransport ? cur(t.groundTransport) : undefined],
    ['Hotel', t?.hotel ? cur(t.hotel) : undefined],
    ['Airfare', t?.airfare ? cur(t.airfare) : undefined],
    ['Merch', merchLabel(t)],
  ])

  add('Payments', paymentAmounts(o.guarantee, t).map((p): [string, string] => [p.when, `${p.pct}% · ${cur(p.amount)}`]))
  add('Terms', [
    ['Production', t?.production],
    ['Hospitality', t?.hospitality],
    ['Radius clause', radiusLabel(t)],
  ])
  add('To decide', [
    ['Routing', t?.routingNotes],
    ['Alternative dates', t?.alternativeDates],
    ['Reply by', t?.respondBy ? longDate(t.respondBy) : undefined],
  ])
  return groups
}

export const pctLabel = (p?: number) => (p === undefined ? '' : `${p.toFixed(1)}%`)
