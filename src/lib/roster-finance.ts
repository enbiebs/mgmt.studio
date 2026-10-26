// ──────────────────────────────────────────────────────────
//  "All artists" → Finance: the money moving in and out, across the artists a person can see money for, in one list. It is the cash
//  forecast (lib/forecast.ts) for each artist put together, so every line already follows its rules (a show covered by a settlement or
//  an invoice is listed once; late means expected before today and not recorded; different currencies are never added together).
//  What this adds is who may see it: Finance is management-side only, and money worked out from a single shared invoice would
//  mislead, so an artist is counted only when the person may open their WHOLE Finance page. What a show is owed, and which
//  settlement an invoice already covers, are worked out from the artist's shows and their fees, which belong to Tour and
//  Deals & fees: without all of those open, only invoices and bills are listed (otherwise a settlement and the invoice
//  it is already on would both be counted). A practice (demo) artist is listed but never counted.
//  Pure logic (no store, no screen), covered by scripts/check-roster-finance.ts.
// ──────────────────────────────────────────────────────────

import type { Client, MainSection, UserRole } from '@/types'
import { buildForecast, fmtAmount, totalsByCurrency, undatedBills, type CurrencyTotals, type ForecastItem } from '@/lib/forecast'
import { addDays } from '@/lib/utils'

/** What this person may do with ONE artist's money. */
export interface FinanceAccess {
  finance: boolean     // may open the whole Finance page, on the management side (never an artist's own login)
  showMoney: boolean   // ... and the whole Tour page and Deals & fees too: settlements and what shows are owed can be worked out
  limited: boolean     // may open Finance only for single items shared with them: their money is not worked out here
}

export function financeAccessFor(
  has: (section: MainSection, clientId: string) => boolean,
  shareOnly: (section: MainSection, clientId: string) => boolean,
  clientId: string,
  role: UserRole,
): FinanceAccess {
  if (role === 'artist') return { finance: false, showMoney: false, limited: false }
  const full = (s: MainSection) => has(s, clientId) && !shareOnly(s, clientId)
  const finance = full('finance')
  return { finance, showMoney: finance && full('tour') && full('deals'), limited: has('finance', clientId) && !finance }
}

export interface FinanceRow extends ForecastItem {
  clientColor: string
  demo: boolean
  workspaceId: string | null     // the company the artist belongs to (money is never added across companies)
  /** Where opening the row goes: the artist's Finance page, or their Tour page for a settlement or show fee. */
  link: { section: 'finance' | 'tour'; sub: string }
}

export interface FinanceInput { client: Client; access: FinanceAccess; workspaceId: string | null }

// A settlement or a show fee lives on the Tour page (and only shows up for someone who may open it); everything else is on Finance.
function linkFor({ go }: ForecastItem): FinanceRow['link'] {
  return go.section === 'tour' ? { section: 'tour', sub: go.sub ?? 'tour' } : { section: 'finance', sub: go.sub ?? 'forecast' }
}

/** Invoices and bills come from Finance alone; a settlement, a show fee or an instalment also needs the shows and their fees. */
const needsShows = (item: ForecastItem) => item.kind !== 'invoice' && item.kind !== 'bill'

export interface RosterFinanceResult {
  rows: FinanceRow[]
  undated: { count: number; byCurrency: string }
  limitedNames: string[]          // artists the person may open only for single shared items: not counted
  noShowMoneyNames: string[]      // artists counted for invoices and bills only (no settlements or show fees)
}

export function buildRosterFinance(inputs: readonly FinanceInput[], today: string): RosterFinanceResult {
  const rows: FinanceRow[] = []
  const undatedTotals: Record<string, number> = {}
  let undatedCount = 0
  const limitedNames: string[] = []
  const noShowMoneyNames: string[] = []

  for (const { client, access, workspaceId } of inputs) {
    if (access.limited) limitedNames.push(client.name)
    if (!access.finance) continue
    if (!access.showMoney && !client.isDemo) noShowMoneyNames.push(client.name)
    for (const item of buildForecast(client, today)) {
      if (!access.showMoney && needsShows(item)) continue
      rows.push({ ...item, clientColor: client.color, demo: !!client.isDemo, workspaceId, link: linkFor(item) })
    }
    if (!client.isDemo) {
      const u = undatedBills(client)
      undatedCount += u.count
      for (const [cur, amt] of Object.entries(u.byCurrency)) undatedTotals[cur] = (undatedTotals[cur] ?? 0) + (amt ?? 0)
    }
  }

  const byCurrency = Object.entries(undatedTotals).sort(([a], [b]) => a.localeCompare(b)).map(([cur, amt]) => fmtAmount(amt, cur as ForecastItem['currency'])).join(' · ')
  return { rows: rows.sort((a, b) => a.date.localeCompare(b.date) || a.clientName.localeCompare(b.clientName) || a.id.localeCompare(b.id)), undated: { count: undatedCount, byCurrency }, limitedNames, noShowMoneyNames }
}

/**
 * One company's money at a time (money is never added across companies). The company is the one the person picked, else the one
 * they are working in, else the first with any money to show. With no company to show, everything is passed on (for the "not counted" note).
 */
export function scopeToCompany(inputs: readonly FinanceInput[], chosen: string | null | undefined, home: string | null): { companies: (string | null)[]; company: string | null; scoped: FinanceInput[] } {
  const companies = [...new Set(inputs.filter(i => i.access.finance).map(i => i.workspaceId))]
  if (companies.length === 0) return { companies, company: null, scoped: [...inputs] }
  const company = chosen !== undefined && companies.includes(chosen) ? chosen : companies.includes(home) ? home : companies[0]
  return { companies, company, scoped: inputs.filter(i => i.workspaceId === company) }
}

export type FinanceWindow = 'late' | '30' | '90' | 'all'

/** One direction (money in or money out), for one artist or all, within a window. A late item is dated before today, so it is inside every window; "late" shows only those. */
export function filterFinance(rows: readonly FinanceRow[], opts: { direction: 'in' | 'out'; window: FinanceWindow; clientId?: string }, today: string): FinanceRow[] {
  const end = opts.window === '30' ? addDays(today, 30) : opts.window === '90' ? addDays(today, 90) : null
  return rows.filter(r =>
    r.direction === opts.direction && (!opts.clientId || r.clientId === opts.clientId)
    && (opts.window === 'all' || (opts.window === 'late' ? r.late : r.date <= end!)))
}

export interface FinanceStats {
  lateIn: string; lateInCount: number          // money expected before today and not recorded
  lateOut: string; lateOutCount: number        // bills past their due date and unpaid
  in30: string                                  // money expected in the next 30 days (late items are apart)
  out30: string
}

/** One line per currency, "$12,000 · £3,000": "" when there is none. Never adds across currencies. */
const line = (totals: CurrencyTotals[], dir: 'in' | 'out') => totals.filter(t => t[dir] > 0.005).map(t => fmtAmount(t[dir], t.currency)).join(' · ')

/** The numbers at the top. A practice artist is never counted. */
export function financeStats(rows: readonly FinanceRow[], today: string): FinanceStats {
  const real = rows.filter(r => !r.demo)
  const end = addDays(today, 30)
  const lateIn = real.filter(r => r.late && r.direction === 'in')
  const lateOut = real.filter(r => r.late && r.direction === 'out')
  const soon = real.filter(r => !r.late && r.date <= end)
  return {
    lateIn: line(totalsByCurrency(lateIn), 'in'), lateInCount: lateIn.length,
    lateOut: line(totalsByCurrency(lateOut), 'out'), lateOutCount: lateOut.length,
    in30: line(totalsByCurrency(soon), 'in'), out30: line(totalsByCurrency(soon), 'out'),
  }
}
