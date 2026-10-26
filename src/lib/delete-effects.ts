// ──────────────────────────────────────────────────────────
//  What deleting a show or an offer really does, in two forms:
//    - afterShowDeleted / afterOfferDeleted: how the artist's data looks afterwards, the same as the database leaves it, so the
//      screen never shows something that is already gone (or hides something that is still there);
//    - showImpact / offerImpact / billImpact / travelImpact: plain-words lines for the "are you sure?" box.
//  Pure logic (no store, no screen), covered by scripts/check-delete-effects.ts.
//
//  What the database does (migrations 003, 016, 023, 026, 028, 055):
//    deleting a SHOW  removes its advance, guest list, fee and deposit, and its links to travel bookings, bills and settlements;
//                     its offer and budget stay, no longer pointing at it.
//    deleting an OFFER removes its offer sheets and any budget made for the offer alone;
//                     a budget that has become a show's budget is kept (it stops pointing at the offer first).
// ──────────────────────────────────────────────────────────

import type { Client, Contract, Expense, Show, TourOffer, TravelItem } from '@/types'
import { formatTotals } from '@/lib/money'

const money = (amount: number, currency: string) => formatTotals({ [currency]: amount })
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function afterShowDeleted(client: Client, showId: string): Client {
  return {
    ...client,
    tour: {
      ...client.tour,
      shows: client.tour.shows.filter(s => s.id !== showId),
      advances: (client.tour.advances ?? []).filter(a => a.showId !== showId),
      guestList: (client.tour.guestList ?? []).filter(g => g.showId !== showId),
      // A travel booking stays; it just stops being tied to this show.
      travel: (client.tour.travel ?? []).map(t => (t.showIds?.includes(showId) ? { ...t, showIds: t.showIds.filter(id => id !== showId) } : t)),
    },
    agentData: client.agentData
      ? { ...client.agentData, offers: client.agentData.offers.map(o => (o.showId === showId ? { ...o, showId: undefined } : o)) }
      : client.agentData,
    finance: {
      ...client.finance,
      budgets: (client.finance.budgets ?? []).map(b => (b.showId === showId ? { ...b, showId: undefined } : b)),
      settlements: (client.finance.settlements ?? []).map(s => (s.showIds.includes(showId) ? { ...s, showIds: s.showIds.filter(id => id !== showId) } : s)),
      expenses: client.finance.expenses.map(e => (e.showIds?.includes(showId) ? { ...e, showIds: e.showIds.filter(id => id !== showId) } : e)),
    },
  }
}

/** The budgets a deleted offer leaves behind: one that has become a show's budget stays (and stops pointing at the offer). */
export function budgetsAfterOfferDeleted(client: Client, offerId: string) {
  return (client.finance.budgets ?? [])
    .filter(b => b.offerId !== offerId || !!b.showId)
    .map(b => (b.offerId === offerId ? { ...b, offerId: undefined } : b))
}

export function afterOfferDeleted(client: Client, offerId: string): Client {
  return {
    ...client,
    tour: {
      ...client.tour,
      shows: client.tour.shows.map(s => (s.tourOfferId === offerId ? { ...s, tourOfferId: undefined } : s)),
      offerSheets: (client.tour.offerSheets ?? []).filter(sh => sh.offerId !== offerId),
    },
    agentData: client.agentData ? { ...client.agentData, offers: client.agentData.offers.filter(o => o.id !== offerId) } : client.agentData,
    finance: { ...client.finance, budgets: budgetsAfterOfferDeleted(client, offerId) },
  }
}

/** Puts a removed item back where it was in a list (or at the end if the list has got shorter). */
export function insertAt<T>(list: readonly T[], item: T, index: number): T[] {
  const i = Math.max(0, Math.min(index, list.length))
  return [...list.slice(0, i), item, ...list.slice(i)]
}

// ── Plain words for the "are you sure?" box ─────────────────
export interface Impact { items: string[]; stays: string[] }

export function showImpact(client: Client, show: Show): Impact {
  const items: string[] = []
  const stays: string[] = []
  if (show.guarantee) items.push(`its fee of ${money(show.guarantee, show.currency ?? 'USD')}${show.deposit ? ` and the ${money(show.deposit, show.currency ?? 'USD')} deposit` : ''}`)
  if ((client.tour.advances ?? []).some(a => a.showId === show.id)) items.push('its advance')
  const guests = (client.tour.guestList ?? []).filter(g => g.showId === show.id).length
  if (guests > 0) items.push(`${plural(guests, 'name')} on its guest list`)
  const trips = (client.tour.travel ?? []).filter(t => t.showIds?.includes(show.id)).length
  if (trips > 0) stays.push(`${plural(trips, 'travel booking')} stay but are no longer tied to it`)
  if ((client.finance.settlements ?? []).some(s => s.showIds.includes(show.id))) stays.push('its settlement stays but loses its link to the show')
  if ((client.finance.budgets ?? []).some(b => b.showId === show.id)) stays.push('its budget stays')
  if (show.invoiceId) stays.push('its invoice stays')
  return { items, stays }
}

export function offerImpact(client: Client, offer: TourOffer): Impact {
  const items: string[] = []
  const stays: string[] = []
  if (offer.guarantee) items.push(`the offer of ${money(offer.guarantee + (offer.buyout ?? 0), 'USD')}`)
  const sheets = (client.tour.offerSheets ?? []).filter(s => s.offerId === offer.id).length
  if (sheets > 0) items.push(`${plural(sheets, 'offer sheet')} sent to the artist`)
  const budgets = (client.finance.budgets ?? []).filter(b => b.offerId === offer.id)
  if (budgets.some(b => !b.showId)) items.push('its budget')
  if (offer.showId || budgets.some(b => !!b.showId)) stays.push('the show it became stays, and so does that show\'s budget')
  return { items, stays }
}

/** Removing an artist removes everything that hangs off them: this counts it, so the box can say so. */
export function clientImpact(client: Client): Impact {
  const items: string[] = []
  const add = (n: number, one: string, many = `${one}s`) => { if (n > 0) items.push(`${n} ${n === 1 ? one : many}`) }
  add(client.tour.shows.length, 'show')
  add(client.agentData?.offers.length ?? 0, 'booking offer')
  add((client.finance.invoices ?? []).length, 'invoice')
  add((client.finance.expenses ?? []).length, 'bill and expense', 'bills and expenses')
  add((client.finance.settlements ?? []).length, 'settlement')
  add((client.legal?.contracts ?? []).length, 'contract')
  add((client.songs?.albums ?? []).reduce((n, a) => n + a.tracks.length, 0), 'song')
  add(client.people?.length ?? 0, 'person', 'people')
  return { items, stays: [] }
}

export function billImpact(expense: Pick<Expense, 'amount' | 'currency' | 'vendor' | 'billFilePath'>): Impact {
  const items = [`the ${money(expense.amount, expense.currency)} bill from ${expense.vendor || 'this vendor'}`]
  if (expense.billFilePath) items.push('the PDF attached to it')
  return { items, stays: [] }
}

/** A contract: what is lost with it, in the words of the "are you sure?" box. Its key dates and reminders go with it, and so do the stored copies once the undo time has passed. */
export function contractImpact(c: Pick<Contract, 'title' | 'files' | 'expiryDate' | 'noticeDays'>): Impact {
  const items = [`the contract "${c.title}"`]
  if (c.expiryDate || c.noticeDays !== undefined) items.push('its end date and the reminders that come from it')
  const n = c.files?.length ?? 0
  if (n > 0) items.push(n === 1 ? 'the copy of the contract kept with it' : `the ${n} copies of the contract kept with it`)
  return { items, stays: [] }
}

/** A travel booking only needs an "are you sure?" when it carries a cost. */
export function travelImpact(item: Pick<TravelItem, 'cost' | 'currency'>): Impact | null {
  if (!item.cost || item.cost <= 0) return null
  return { items: [`the ${money(item.cost, item.currency ?? 'USD')} cost recorded on it`], stays: [] }
}

/** The sentence under the title: what stays, or nothing. */
export const staysLine = (impact: Impact): string | undefined => (impact.stays.length ? `${impact.stays.map((s, i) => (i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s)).join('; ')}.` : undefined)
