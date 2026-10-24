// ──────────────────────────────────────────────────────────
//  The "No budget yet" list on the Budget tab: the offers and shows that could get a budget. A gig is both an offer and a
//  show once confirmed, so listing both made the same gig appear twice. The two are the same gig when the app linked them
//  (either side holds the link) or, for a show added directly or imported, when an offer with no show and a show that no
//  offer owns fall on the same day at the same venue. Cancelled offers and shows never pair up with anything.
//  Pure logic (no store, no screen), covered by scripts/check-budget-candidates.ts.
// ──────────────────────────────────────────────────────────

import type { Budget, Show, TourOffer } from '@/types'

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** An offer and a show on the same day at the same venue (ignoring case and spacing; a blank venue never matches). */
export const sameGig = (o: Pick<TourOffer, 'date' | 'venue'>, s: Pick<Show, 'date' | 'venue'>): boolean =>
  o.date === s.date && norm(o.venue) !== '' && norm(o.venue) === norm(s.venue)

const LIVE_OFFER = ['inquiry', 'hold', 'confirmed']

/** The app's own link between an offer and its show: either side may hold it. */
const linked = (o: Pick<TourOffer, 'id' | 'showId'>, s: Pick<Show, 'id' | 'tourOfferId'>) => o.showId === s.id || s.tourOfferId === o.id

/** Each gig once: its offer while it is only an offer, its show once there is one. */
export function budgetCandidates(
  offers: readonly TourOffer[], shows: readonly Show[], budgets: readonly Pick<Budget, 'offerId' | 'showId'>[],
): { needOffer: TourOffer[]; needShow: Show[] } {
  const offerHasBudget = (id: string) => budgets.some(b => b.offerId === id)
  const showHasBudget = (id: string) => budgets.some(b => b.showId === id)
  const livingShows = shows.filter(s => !s.historyOnly)
  // Unlinked, both still going ahead, same day and venue: one gig that nothing links yet.
  const sameUnlinkedGig = (o: TourOffer, s: Show) =>
    o.status !== 'cancelled' && s.status !== 'cancelled' && !shows.some(x => linked(o, x)) && !offers.some(x => linked(x, s)) && sameGig(o, s)
  return {
    needOffer: offers.filter(o =>
      LIVE_OFFER.includes(o.status) && !offerHasBudget(o.id)
      && !shows.some(s => linked(o, s) && showHasBudget(s.id))                         // its linked show already has the budget
      && !livingShows.some(s => sameUnlinkedGig(o, s))),                               // an unlinked show of the same gig is listed instead
    needShow: livingShows.filter(s =>
      !showHasBudget(s.id) && !offers.some(o => linked(o, s))                          // a linked offer is listed instead
      && !offers.some(o => sameUnlinkedGig(o, s) && offerHasBudget(o.id))),            // the offer already has the gig's budget
  }
}
