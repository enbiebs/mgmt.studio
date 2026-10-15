'use client'
import { useStore } from '@/lib/store'
import type { ProgressLink } from '@/lib/show-progress'

/** Opens the place a progress button points to, keeping the same show selected. */
export function goShowStep(showId: string, link: ProgressLink): void {
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
