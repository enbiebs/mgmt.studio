// "May open the whole section for this artist", as opposed to only single items that were sent to them.
// Anything worked out from many rows (a total, a count, an alert) must use this, because someone sent one item loads only
// that item and a figure built from it would mislead.

import type { MainSection } from '@/types'

type Has = (section: MainSection, clientId: string) => boolean

export const mayOpenFully = (has: Has, shareOnly: Has, clientId: string) => (section: MainSection): boolean =>
  has(section, clientId) && !shareOnly(section, clientId)
