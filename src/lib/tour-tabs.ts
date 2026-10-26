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

// ── Four tabs on top, five screens inside a show ─────────────
//  The nine screens are still there (each keeps its address), but the Tour page shows four tabs. Shows holds everything about
//  ONE show (details, advance, travel, guests, day sheet), so the show is picked once and its steps are one bar.
export type TourGroup = 'shows' | 'offers' | 'money' | 'crew'
export const TOUR_GROUPS: TourGroup[] = ['shows', 'offers', 'money', 'crew']
export const TOUR_GROUP_LABEL: Record<TourGroup, string> = { shows: 'Shows', offers: 'Offers', money: 'Money', crew: 'Crew' }

const GROUP_OF: Record<(typeof TOUR_TAB_ORDER)[number], TourGroup> = {
  tour: 'shows', advance: 'shows', travel: 'shows', guests: 'shows', daysheet: 'shows', offers: 'offers', budget: 'money', settlements: 'money', crew: 'crew',
}
/** The tab a screen belongs to (the stage plot, which has no screen of its own, counts as Shows). */
export const groupOfSub = (sub: string): TourGroup => (Object.hasOwn(GROUP_OF, sub) ? GROUP_OF[sub as keyof typeof GROUP_OF] : 'shows')

/** The tabs this person gets, from the screens they can open. */
export const visibleTourGroups = (tabs: readonly string[]): TourGroup[] => TOUR_GROUPS.filter(g => tabs.some(t => groupOfSub(t) === g))

/** Where clicking a tab goes: stay on the screen you are on if it belongs to that tab, else the tab's first screen this person has. */
export function subForGroup(group: TourGroup, current: string, tabs: readonly string[]): string {
  if (groupOfSub(current) === group && tabs.includes(current)) return current
  return TOUR_TAB_ORDER.find(t => GROUP_OF[t] === group && tabs.includes(t)) ?? current
}

/**
 * What the New gig button offers. A booked show and a spreadsheet of shows are Tour; an offer and a pasted offer are Deals & fees.
 * Someone who may add neither gets no button at all.
 */
export function gigChoices(can: { show: boolean; offer: boolean }): { button: boolean; booked: boolean; talking: boolean; paste: boolean; spreadsheet: boolean } {
  return { button: can.show || can.offer, booked: can.show, talking: can.offer, paste: can.offer, spreadsheet: can.show }
}
