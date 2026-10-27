// ──────────────────────────────────────────────────────────
//  The phone's bottom bar: the pages a person opens most sit on the bar, the rest go under "More". Pure logic (no store, no screen),
//  covered by scripts/check-phone-tabs.ts. The sidebar is not shown on a phone, so this bar is how you move around there.
// ──────────────────────────────────────────────────────────

/** Most places on the bar, "More" included: any more and each one gets too small to tap. */
export const BAR_SLOTS = 5

/** The pages that come first on the bar when there is not room for all of them: what someone on the road opens most. */
// (Music is 'songs' inside an artist and 'music' on the All-artists pages.)
export const PHONE_FIRST: readonly string[] = ['today', 'calendar', 'tour', 'songs', 'music']

export interface PhoneTabs<T> {
  /** On the bar itself, left to right. */
  bar: T[]
  /** Under "More" (empty when everything fits on the bar). */
  more: T[]
  /** True when the open page is one of the "More" ones, so the "More" place can look selected. */
  moreActive: boolean
}

/**
 * Everything fits (up to BAR_SLOTS pages): the bar is the pages, in order. Otherwise the bar keeps the first BAR_SLOTS - 1 pages by
 * PHONE_FIRST (then in their usual order) and "More" holds the rest, in their usual order.
 */
export function phoneTabs<T extends { key: string }>(items: readonly T[], activeKey?: string): PhoneTabs<T> {
  if (items.length <= BAR_SLOTS) return { bar: [...items], more: [], moreActive: false }
  const rank = (k: string) => { const i = PHONE_FIRST.indexOf(k); return i === -1 ? PHONE_FIRST.length : i }
  const ordered = [...items].sort((a, b) => rank(a.key) - rank(b.key))   // a stable sort: pages of the same rank keep their usual order
  const bar = ordered.slice(0, BAR_SLOTS - 1)
  const more = items.filter(i => !bar.includes(i))
  return { bar, more, moreActive: more.some(i => i.key === activeKey) }
}
