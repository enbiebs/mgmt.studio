'use client'
import { useStore } from '@/lib/store'
import type { DealLink } from '@/lib/deal'

/** Opens the place a deal button points to, keeping the same show selected. */
export function goDeal(showId: string, link: DealLink): void {
  const s = useStore.getState()
  if (link.section === 'finance') {
    s.setSection('finance')
    s.setBizSub(link.sub)
    return
  }
  s.setSection('tour')            // (switching sections clears the selected show, so select it after)
  s.setTourSub(link.sub)
  s.setSelectedShow(showId)
}
