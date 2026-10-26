// ──────────────────────────────────────────────────────────
//  Small helpers the artist Overview and the "All artists" pages share: the next release, the songs not finished, what is
//  still owed on invoices, and the plain-words date helpers. Each reuses the same rule the artist's own page uses, so two
//  screens can never disagree. Pure logic (no store, no screen), covered by scripts/check-roster-summary.ts.
// ──────────────────────────────────────────────────────────

import type { Album, Contract, Deposit, Invoice, Show } from '@/types'
import { daysUntil } from '@/lib/date-state'
import { formatTotals, invoiceStateWithDeposits, owedByCurrency } from '@/lib/money'
import { MONTH_SHORT } from '@/lib/utils'

/** Only the parts of an artist these helpers (and the Overview built on them) read, so a test can build one in a few lines. */
export interface SummaryClient {
  tour: { shows: Show[] }
  songs: { albums: Album[] }
  finance: { invoices: Invoice[] }
  business: { banking: { deposits: Deposit[] } }
  legal: { contracts: Contract[] }
}

export const dayWord = (iso: string) => `${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "today", "tomorrow", "in 12 days". */
export function whenWord(date: string, today: string): string {
  const d = daysUntil(date, today)
  return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`
}

/** The next release still ahead (releasing today counts), soonest first, or undefined. */
export function nextRelease(albums: readonly Album[], today: string): Album | undefined {
  return albums.filter(a => a.releaseDate && a.releaseDate >= today).sort((a, b) => a.releaseDate!.localeCompare(b.releaseDate!))[0]
}

/** Songs across every release that are not finished yet. */
export const unfinishedSongs = (albums: readonly Album[]): number => albums.reduce((n, a) => n + a.tracks.filter(t => t.stage !== 'done').length, 0)

/** What is still owed on an artist's invoices (per currency, as one line), how many invoices are open and how many are late. */
export function owedFigures(c: Pick<SummaryClient, 'finance' | 'business'>, today: string): { owed: string; open: number; overdue: number } {
  const deposits = c.business.banking.deposits
  const open = c.finance.invoices.filter(i => {
    const state = invoiceStateWithDeposits(i, today, deposits)
    return state === 'sent' || state === 'overdue'
  })
  return {
    owed: formatTotals(owedByCurrency(open, deposits)),
    open: open.length,
    overdue: open.filter(i => invoiceStateWithDeposits(i, today, deposits) === 'overdue').length,
  }
}
