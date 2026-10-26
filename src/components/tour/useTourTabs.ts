'use client'
// The Tour screens this person can open, worked out the way the tab strip and the page do (Tour, Deals & fees, Finance, and the
// "only some shows were shared with me" case), so the step bar on a show agrees with the tabs above it.

import { useStore } from '@/lib/store'
import { shareOnlyTabs } from '@/lib/item-access'
import { visibleTourTabs } from '@/lib/tour-tabs'

export function useTourTabs(): string[] {
  const client = useStore(s => s.getClient())
  const hasTour = useStore(s => s.hasAccess('tour'))
  const hasDeals = useStore(s => s.hasAccess('deals'))
  // Budgets and settlements are money: management side only (never the artist).
  const canSeeBudgets = useStore(s => s.role !== 'artist' && s.hasAccess('finance'))
  const shareOnly = useStore(s => s.isShareOnly('tour'))
  return visibleTourTabs({ tour: hasTour, deals: hasDeals, finance: canSeeBudgets, sharedTabs: shareOnly ? shareOnlyTabs('tour', client ?? undefined) : undefined })
}
