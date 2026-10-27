// ──────────────────────────────────────────────────────────
//  An artist's statement: for a period, what came in, what went out, what the shows paid and what was taken from them, and what is still
//  owed. Pure logic (no store, no screen), covered by scripts/check-statement.ts.
//
//  It does not invent a method: the money in and out is the app's own profit & loss (lib/ledger.ts), the show lines use the same cut rule
//  as everywhere else (showCommissions), and unpaid invoices are the ones the Invoices page calls outstanding. Each currency has its own
//  section; pounds and euros are never added into dollars. It only knows what is entered in Mgmt Path, and says so on the page.
// ──────────────────────────────────────────────────────────

import type { Client, PLMonth } from '@/types'
import { buildPL, SOURCE_LABEL, type PLSource } from '@/lib/ledger'
import { owedByCurrency, r2, showCommissions, invoiceStateWithDeposits } from '@/lib/money'
import { CAT_LABELS } from '@/lib/expense-categories'

export type PeriodKey = 'last-month' | 'last-3' | 'this-year' | 'last-year'
export interface Period { key: PeriodKey; label: string; from: string; to: string }   // 'YYYY-MM' to 'YYYY-MM', both included

const monthOf = (iso: string) => iso.slice(0, 7)
const shift = (month: string, by: number) => { const [y, m] = month.split('-').map(Number); const i = y * 12 + (m - 1) + by; return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}` }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const monthWord = (month: string) => `${MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`

/** The periods a person can pick, newest ideas first. "Last 3 months" ends with the last full month. */
export function periodChoices(today: string): Period[] {
  const thisMonth = monthOf(today), last = shift(thisMonth, -1), year = Number(today.slice(0, 4))
  return [
    { key: 'last-month', label: monthWord(last), from: last, to: last },
    { key: 'last-3', label: `${monthWord(shift(last, -2))} to ${monthWord(last)}`, from: shift(last, -2), to: last },
    { key: 'this-year', label: `${year} so far`, from: `${year}-01`, to: thisMonth },
    { key: 'last-year', label: String(year - 1), from: `${year - 1}-01`, to: `${year - 1}-12` },
  ]
}

export interface Line { label: string; amount: number }
export interface ShowLine { date: string; venue: string; city: string; fee: number; agency: number; management: number; net: number }
export interface CurrencySection {
  currency: string
  income: Line[]; incomeTotal: number
  costs: Line[]; costsTotal: number
  net: number
  shows: ShowLine[]
  showTotals: { fee: number; agency: number; management: number; net: number }
  owed: number                       // invoices sent and not yet paid, in this currency, as of the day the statement is made (not as of the period's end)
}
export interface Statement {
  artist: string
  company: string
  period: Period
  generated: string
  sections: CurrencySection[]
  sources: string[]                  // where the figures come from, in words ("From your records")
  empty: boolean                     // nothing at all in the period
}

const INCOME_LABEL: Record<keyof PLMonth['revenue'], string> = { touring: 'Touring', streaming: 'Streaming', sync: 'Sync', brand: 'Brand deals', merch: 'Merch', other: 'Other income' }
const sumLines = (lines: Line[]) => r2(lines.reduce((a, l) => a + l.amount, 0))

/**
 * `includeShows` adds each show's fee and what was taken from it. It is off unless asked for: what a show pays is management's business
 * (the artist normally sees it only on an offer sheet), so it should be a choice to put it on a page that goes to the artist.
 * Only shows that have happened are listed (a show later this month is not in "2026 so far" yet).
 */
export function buildStatement(client: Client, period: Period, o: { company: string; today: string; includeShows?: boolean }): Statement {
  const ledger = buildPL(client, o.today)
  const deposits = client.business?.banking?.deposits ?? []
  const open = (client.finance?.invoices ?? []).filter(i => { const s = invoiceStateWithDeposits(i, o.today, deposits); return s === 'sent' || s === 'overdue' })
  const owed = owedByCurrency(open, deposits)
  const sources = new Set<PLSource>()

  const currencies = new Set<string>([...ledger.currencies])
  const showsIn = !o.includeShows ? [] : (client.tour?.shows ?? []).filter(s => !!s.guarantee && s.status === 'confirmed' && s.date.slice(0, 10) <= o.today && monthOf(s.date) >= period.from && monthOf(s.date) <= period.to)
  for (const s of showsIn) currencies.add(s.currency ?? 'USD')
  for (const cur of Object.keys(owed)) currencies.add(cur)

  const sections: CurrencySection[] = []
  for (const currency of currencies) {
    const months = (ledger.months[currency] ?? []).filter(m => m.month >= period.from && m.month <= period.to && m.source !== 'none')
    months.forEach(m => sources.add(m.source))
    const income = (Object.keys(INCOME_LABEL) as (keyof PLMonth['revenue'])[]).map(k => ({ label: INCOME_LABEL[k], amount: r2(months.reduce((a, m) => a + m.revenue[k], 0)) })).filter(l => l.amount !== 0)
    const costs = (Object.keys(CAT_LABELS) as (keyof PLMonth['expenses'])[]).map(k => ({ label: CAT_LABELS[k], amount: r2(months.reduce((a, m) => a + (m.expenses[k] ?? 0), 0)) })).filter(l => l.amount !== 0)
    const shows = showsIn.filter(s => (s.currency ?? 'USD') === currency).sort((a, b) => a.date.localeCompare(b.date)).map(s => { const k = showCommissions(s); return { date: s.date.slice(0, 10), venue: s.venue, city: s.city, fee: k.fee, agency: k.agency, management: k.management, net: k.net } })
    const showTotals = { fee: r2(shows.reduce((a, s) => a + s.fee, 0)), agency: r2(shows.reduce((a, s) => a + s.agency, 0)), management: r2(shows.reduce((a, s) => a + s.management, 0)), net: r2(shows.reduce((a, s) => a + s.net, 0)) }
    const section: CurrencySection = { currency, income, incomeTotal: sumLines(income), costs, costsTotal: sumLines(costs), net: r2(sumLines(income) - sumLines(costs)), shows, showTotals, owed: owed[currency] ?? 0 }
    if (income.length > 0 || costs.length > 0 || shows.length > 0 || section.owed > 0) sections.push(section)
  }
  const home = ledger.currencies[0]
  sections.sort((a, b) => (a.currency === home ? -1 : b.currency === home ? 1 : a.currency.localeCompare(b.currency)))
  return {
    artist: client.name, company: o.company.trim(), period, generated: o.today, sections,
    sources: [...sources].map(s => SOURCE_LABEL[s]).sort(),
    empty: sections.every(s => s.income.length === 0 && s.costs.length === 0 && s.shows.length === 0),
  }
}

export function statementFileName(s: Statement): string {
  const part = (x: string) => x.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
  return `${['Statement', part(s.artist), part(s.period.label)].filter(Boolean).join(' - ')}.pdf`
}
