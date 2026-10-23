// Opens what an alert (an item of the Inbox) is about: the artist, the page, and the tab inside it.
// Used by the Today list and the artist Overview, so an alert opens the same place from both.

import { useStore } from '@/lib/store'
import type { InboxItem } from '@/lib/inbox'
import type { BizSub, LegalSub, TourSub } from '@/types'

export function openInboxItem(item: InboxItem): void {
  const s = useStore.getState()
  s.openClient(item.clientId)
  s.setSection(item.go.section)
  if (item.go.section === 'finance' && item.go.sub) s.setBizSub(item.go.sub as BizSub)
  if (item.go.section === 'tour' && item.go.sub) s.setTourSub(item.go.sub as TourSub)
  if (item.go.section === 'legal' && item.go.sub) s.setLegalSub(item.go.sub as LegalSub)
}
