// ──────────────────────────────────────────────────────────
//  The one line each artist gets on the "All artists" Tour, Music, Finance and Legal pages (the pick-an-artist pages):
//    Tour -> the next show, Music -> the next release, Finance -> money owed, Legal -> contracts needing attention.
//  Every number reuses the same helper the artist's own page uses, so the line can never disagree with the page it opens.
//  Pure logic (no store, no screen), covered by scripts/check-roster-summary.ts.
// ──────────────────────────────────────────────────────────

import type { Album, Contract, Deposit, Invoice, Show } from '@/types'
import { daysUntil, isUpcomingShow, nextShow } from '@/lib/date-state'
import { contractAlerts, expiryLine } from '@/lib/contract-status'
import { formatTotals, invoiceStateWithDeposits, owedByCurrency } from '@/lib/money'
import { MONTH_SHORT } from '@/lib/utils'

export type SummaryPage = 'tour' | 'music' | 'finance' | 'legal'

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

const dayWord = (iso: string) => `${MONTH_SHORT[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Today", "Tomorrow", "in 12 days". */
function whenWord(date: string, today: string): string {
  const d = daysUntil(date, today)
  return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`
}

function tourSummary(c: SummaryClient, today: string): ArtistSummary {
  const next = nextShow(c.tour.shows, today)
  if (!next) return { headline: 'No shows ahead', tone: 'quiet' }
  const more = c.tour.shows.filter(s => isUpcomingShow(s, today)).length - 1
  const place = next.city || next.venue
  const parts = [`${dayWord(next.date)} · ${whenWord(next.date, today)}`, next.status === 'hold' ? 'on hold' : '']
  if (more > 0) parts.push(`${more} more after`)
  return { headline: `Next: ${place}`, detail: parts.filter(Boolean).join(' · '), tone: next.status === 'hold' ? 'todo' : 'ok' }
}

function musicSummary(c: SummaryClient, today: string): ArtistSummary {
  const releases = c.songs.albums.filter(a => a.releaseDate && a.releaseDate >= today).sort((a, b) => a.releaseDate!.localeCompare(b.releaseDate!))
  const unfinished = c.songs.albums.reduce((n, a) => n + a.tracks.filter(t => t.stage !== 'done').length, 0)
  const inProgress = unfinished > 0 ? `${plural(unfinished, 'song')} not finished` : undefined
  const next = releases[0]
  if (next) return { headline: `${next.title || 'Untitled'} · ${dayWord(next.releaseDate!)}`, detail: [whenWord(next.releaseDate!, today), inProgress].filter(Boolean).join(' · '), tone: unfinished > 0 ? 'todo' : 'ok' }
  if (unfinished > 0) return { headline: 'No release date set', detail: inProgress, tone: 'todo' }
  return { headline: c.songs.albums.length > 0 ? 'Nothing in progress' : 'No music yet', tone: 'quiet' }
}

function financeSummary(c: SummaryClient, today: string): ArtistSummary {
  const deposits = c.business.banking.deposits
  const open = c.finance.invoices.filter(i => {
    const state = invoiceStateWithDeposits(i, today, deposits)
    return state === 'sent' || state === 'overdue'
  })
  const owed = formatTotals(owedByCurrency(open, deposits))
  if (!owed) return { headline: 'Nothing owed', tone: c.finance.invoices.length > 0 ? 'ok' : 'quiet' }
  const overdue = open.filter(i => invoiceStateWithDeposits(i, today, deposits) === 'overdue').length
  return { headline: `${owed} owed`, detail: overdue > 0 ? `${plural(overdue, 'invoice')} overdue` : `${plural(open.length, 'open invoice')}`, tone: overdue > 0 ? 'late' : 'todo' }
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
    case 'tour': return tourSummary(client, today)
    case 'music': return musicSummary(client, today)
    case 'finance': return financeSummary(client, today)
    case 'legal': return legalSummary(client, today)
  }
}
