// ──────────────────────────────────────────────────────────
//  The Tour page is made of two permissions: Tour (the schedule, advance, day sheets, travel, crew, guest list) and Deals &
//  fees (the Offers tab, and the money on each show), plus Finance for budgets and settlements. Someone with only Deals &
//  fees (a business manager, say) still opens the Tour page, but it shows just the Offers tab. These helpers decide which
//  tabs a person gets, so the side menu, the tab strip and the page agree. Pure logic, so it can be tested.
// ──────────────────────────────────────────────────────────
import type { MainSection } from '@/types'

export const TOUR_TAB_ORDER = ['tour', 'offers', 'budget', 'settlements', 'advance', 'daysheet', 'travel', 'crew', 'guests'] as const

/** One plain line under the tab strip saying what each tab is for (so no one has to know the trade words). Short, so it stays on one line on a phone. */
export const TOUR_TAB_HINT: Record<(typeof TOUR_TAB_ORDER)[number], string> = {
  tour: 'Shows for this artist. Open one to see what is left to do.',
  offers: 'Offers being negotiated. A confirmed offer becomes a show.',
  budget: 'Plan what a show will cost and earn.',
  settlements: "The promoter's final numbers, and what you're still owed.",
  advance: 'Details to confirm with the venue before the show.',
  daysheet: 'A one-page schedule for show day, from the advance.',
  travel: 'Flights, hotels and ground transport.',
  crew: 'Everyone who travels with the artist.',
  guests: 'The guest list for each show.',
}

export interface TourAccess {
  /** Tour access of any kind, including a single shared show (view only). */
  tour: boolean
  deals: boolean
  finance: boolean
  /** Set when the person has Tour only because some shows were shared with them: just these tabs show them. */
  sharedTabs?: string[]
}

/** The Tour tabs this person gets, in menu order. */
export function visibleTourTabs(a: TourAccess): string[] {
  return TOUR_TAB_ORDER.filter(tab => {
    if (tab === 'offers') return a.deals
    if (tab === 'budget' || tab === 'settlements') return a.finance && !a.sharedTabs
    return a.tour && (!a.sharedTabs || a.sharedTabs.includes(tab))
  })
}

/** Does this person open this part of the app at all? The Tour page also opens for Deals & fees alone. */
export function canOpenSection(section: MainSection, has: (section: MainSection) => boolean): boolean {
  return has(section) || (section === 'tour' && has('deals'))
}
