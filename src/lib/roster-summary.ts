// ──────────────────────────────────────────────────────────
//  The one line each artist gets on the "All artists" Music and Legal pages (the pick-an-artist pages):
//    Music -> the next release, Legal -> contracts needing attention.
//  Every number reuses the same helper the artist's own page uses, so the line can never disagree with the page it opens.
//  Pure logic (no store, no screen), covered by scripts/check-roster-summary.ts.
// ──────────────────────────────────────────────────────────

import type { Album, Contract, Deposit, Invoice, Show } from '@/types'
import { daysUntil } from '@/lib/date-state'
import { contractAlerts, expiryLine } from '@/lib/contract-status'
import { formatTotals, invoiceStateWithDeposits, owedByCurrency } from '@/lib/money'
import { MONTH_SHORT } from '@/lib/utils'

export type SummaryPage = 'music' | 'legal'

/** ok = nothing to do, todo = something to do, late = needs attention now, quiet = nothing there yet. */
export type SummaryTone = 'ok' | 'todo' | 'late' | 'quiet'

export interface ArtistSummary { headline: string; detail?: string; tone: SummaryTone }

/** Only the parts of an artist the summary reads, so a test can build one in a few lines. */
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

function musicSummary(c: SummaryClient, today: string): ArtistSummary {
  const unfinished = unfinishedSongs(c.songs.albums)
  const inProgress = unfinished > 0 ? `${plural(unfinished, 'song')} not finished` : undefined
  const next = nextRelease(c.songs.albums, today)
  if (next) return { headline: `${next.title || 'Untitled'} · ${dayWord(next.releaseDate!)}`, detail: [whenWord(next.releaseDate!, today), inProgress].filter(Boolean).join(' · '), tone: unfinished > 0 ? 'todo' : 'ok' }
  if (unfinished > 0) return { headline: 'No release date set', detail: inProgress, tone: 'todo' }
  return { headline: c.songs.albums.length > 0 ? 'Nothing in progress' : 'No music yet', tone: 'quiet' }
}

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

function legalSummary(c: SummaryClient, today: string): ArtistSummary {
  const contracts = c.legal.contracts
  if (contracts.length === 0) return { headline: 'No contracts', tone: 'quiet' }
  const alerts = contractAlerts(contracts, today)
  if (alerts.count === 0) return { headline: 'All clear', detail: plural(contracts.length, 'contract'), tone: 'ok' }
  const worst = alerts.expired[0] ?? alerts.expiring[0] ?? alerts.flagged[0]
  const why = worst ? [worst.title, expiryLine(worst, today) ?? (worst.flagged ? 'Flagged for review' : '')].filter(Boolean).join(' · ') : undefined
  return { headline: `${plural(alerts.count, 'contract')} need${alerts.count === 1 ? 's' : ''} attention`, detail: why, tone: alerts.expired.length > 0 ? 'late' : 'todo' }
}

export function summarize(page: SummaryPage, client: SummaryClient, today: string): ArtistSummary {
  switch (page) {
    case 'music': return musicSummary(client, today)
    case 'legal': return legalSummary(client, today)
  }
}
