// ──────────────────────────────────────────────────────────
//  What the ⌘K bar can find beyond the pages, artists, shows, offers, invoices, to-dos and projects it already knew:
//  contracts, songs, releases, people, guests, settlements, bills, budgets, posts and travel bookings. A search for "Kobalt",
//  "Long Time" or "Dana" now finds them.
//
//  Each result carries where it opens (an artist, a page, a tab, and the show / release / budget when it is one). Only what the
//  person may see is listed: every group is behind the same access check as the page it lives on.
//  Pure logic (no store, no screen), covered by scripts/check-search-records.ts.
// ──────────────────────────────────────────────────────────

import type { Client, MainSection, TravelItem } from '@/types'
import type { Searchable } from '@/lib/command-search'
import { formatTotals } from '@/lib/money'

export interface SearchTarget {
  clientId: string
  section: MainSection
  tourSub?: 'tour' | 'travel' | 'guests' | 'budget' | 'settlements'
  bizSub?: 'payments'
  songsSub?: 'tracks'
  legalSub?: 'pipeline'
  contentSub?: 'manage'
  selectedShowId?: string
  selectedAlbumId?: string
  selectedBudgetId?: string
}

export interface RecordEntry extends Searchable {
  id: string
  icon: 'legal' | 'music' | 'team' | 'finance' | 'content' | 'tour' | 'calendar'
  target: SearchTarget
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const money = (amount: number, currency: string) => formatTotals({ [currency]: amount })
const dateText = (iso?: string) => (iso ? new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '')
const join = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' · ')

function travelLabel(t: TravelItem): { label: string; keywords: string } {
  if (t.kind === 'flight') {
    const legs = t.legs ?? []
    const first = legs[0], last = legs[legs.length - 1]
    const numbers = legs.map(l => join(l.airline, l.flightNumber).replace(' · ', ' ')).filter(Boolean).join(', ')
    const route = first && last ? `${first.from ?? first.fromCity ?? ''} → ${last.to ?? last.toCity ?? ''}` : ''
    return { label: join(numbers || 'Flight', route), keywords: [t.traveler, t.confirmationCode, ...legs.flatMap(l => [l.fromCity, l.toCity, l.from, l.to])].filter(Boolean).join(' ') }
  }
  if (t.kind === 'hotel') return { label: t.name || 'Hotel', keywords: [t.address, t.confirmationCode, t.roomType].filter(Boolean).join(' ') }
  return { label: join(t.provider || cap(t.type.replace('-', ' ')), t.from && t.to ? `${t.from} → ${t.to}` : ''), keywords: [t.type, t.vehicleType, t.confirmationCode].filter(Boolean).join(' ') }
}

/** Everything searchable in these artists' records that this person may see. `can(section, clientId)` is the same access check the pages use. */
export function buildRecordEntries(roster: Client[], can: (section: MainSection, clientId: string) => boolean): RecordEntry[] {
  const out: RecordEntry[] = []

  for (const c of roster) {
    if (can('legal', c.id)) for (const k of c.legal?.contracts ?? []) {
      out.push({
        id: `contract-${k.id}`, group: 'Contracts', icon: 'legal', label: k.title,
        hint: join(c.name, k.counterparty, cap(k.status)), keywords: [k.counterparty, k.type, k.notes].filter(Boolean).join(' '),
        target: { clientId: c.id, section: 'legal', legalSub: 'pipeline' },
      })
    }

    if (can('songs', c.id)) for (const a of c.songs?.albums ?? []) {
      out.push({
        id: `release-${a.id}`, group: 'Releases', icon: 'music', label: a.title || 'Untitled release',
        hint: join(c.name, a.type ? cap(a.type) : 'Release', a.releaseDate && dateText(a.releaseDate)), keywords: `${a.labelCopy?.upc ?? ''} ${a.labelCopy?.label ?? ''}`,
        target: { clientId: c.id, section: 'songs', songsSub: 'tracks', selectedAlbumId: a.id },
      })
      for (const t of a.tracks ?? []) {
        out.push({
          id: `song-${t.id}`, group: 'Songs', icon: 'music', label: t.title || 'Untitled',
          hint: join(c.name, a.title, t.stage && cap(t.stage)), keywords: [t.labelCopy?.isrc, t.labelCopy?.writers, t.owner].filter(Boolean).join(' '),
          target: { clientId: c.id, section: 'songs', songsSub: 'tracks', selectedAlbumId: a.id },
        })
      }
    }

    // Team, crew and release contacts are all people on the artist.
    if (can('team', c.id)) for (const p of c.people ?? []) {
      out.push({
        id: `person-${p.id}`, group: 'People', icon: 'team', label: p.name,
        hint: join(c.name, p.title, p.org), keywords: [p.email, p.phone, p.org, p.title].filter(Boolean).join(' '),
        target: { clientId: c.id, section: 'team' },
      })
    }

    if (can('tour', c.id)) {
      const showName = (id: string) => c.tour.shows.find(s => s.id === id)
      for (const g of c.tour.guestList ?? []) {
        const show = showName(g.showId)
        out.push({
          id: `guest-${g.id}`, group: 'Guests', icon: 'tour', label: g.name,
          hint: join(c.name, 'on the guest list', show && join(show.venue, dateText(show.date))), keywords: `${g.category ?? ''} ${g.credential ?? ''}`,
          target: { clientId: c.id, section: 'tour', tourSub: 'guests', selectedShowId: g.showId },
        })
      }
      for (const t of c.tour.travel ?? []) {
        if (t.status === 'cancelled') continue
        const { label, keywords } = travelLabel(t)
        const first = t.showIds?.map(showName).find(Boolean)
        out.push({
          id: `travel-${t.id}`, group: 'Travel', icon: 'tour', label,
          hint: join(c.name, cap(t.kind), first && first.venue), keywords,
          target: { clientId: c.id, section: 'tour', tourSub: 'travel', selectedShowId: first?.id },
        })
      }
    }

    if (can('finance', c.id)) {
      for (const s of c.finance?.settlements ?? []) {
        out.push({
          id: `settlement-${s.id}`, group: 'Settlements', icon: 'finance', label: join(s.venue ?? s.eventName, s.promoter) || 'Settlement',
          hint: join(c.name, 'Settlement', money(s.totalDue, s.currency)), keywords: `${s.eventName ?? ''} ${s.preparedBy ?? ''}`,
          target: { clientId: c.id, section: 'tour', tourSub: 'settlements' },
        })
      }
      for (const e of c.finance?.expenses ?? []) {
        out.push({
          id: `bill-${e.id}`, group: 'Bills', icon: 'finance', label: join(e.vendor, e.description) || 'Bill',
          hint: join(c.name, e.paid ? 'Paid' : 'Unpaid', money(e.amount, e.currency)), keywords: `${e.billNumber ?? ''} ${e.category}`,
          target: { clientId: c.id, section: 'finance', bizSub: 'payments' },
        })
      }
      for (const b of c.finance?.budgets ?? []) {
        const show = b.showId ? showNameOf(c, b.showId) : undefined
        out.push({
          id: `budget-${b.id}`, group: 'Budgets', icon: 'finance', label: b.name || 'Budget',
          hint: join(c.name, 'Budget', show), keywords: `${b.notes ?? ''}`,
          target: { clientId: c.id, section: 'tour', tourSub: 'budget', selectedBudgetId: b.id },
        })
      }
    }

    if (can('content', c.id)) for (const p of c.content?.posts ?? []) {
      out.push({
        id: `post-${p.id}`, group: 'Posts', icon: 'content', label: p.title,
        hint: join(c.name, 'Post', dateText(p.date)), keywords: p.type,
        target: { clientId: c.id, section: 'content', contentSub: 'manage' },
      })
    }
  }
  // The groups always list in the same order, whichever artist has what.
  return out.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
}

export const GROUP_ORDER = ['Contracts', 'Releases', 'Songs', 'People', 'Guests', 'Travel', 'Settlements', 'Bills', 'Budgets', 'Posts']

const showNameOf = (c: Client, showId: string) => { const s = c.tour.shows.find(x => x.id === showId); return s ? join(s.venue, dateText(s.date)) : undefined }
