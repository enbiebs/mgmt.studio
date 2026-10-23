'use client'
// The Inbox for the signed-in person: every item from the artists they can see, minus what
// they've marked done or snoozed. Money items only appear for people with Finance access (not for someone sent a single invoice),
// show/offer items for people with Tour access, contract items for Legal, project items for Projects; the artist's own login gets nothing.

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { today } from '@/lib/utils'
import { buildInbox, inboxAccessFor, isHidden, type InboxItem, type InboxSeverity } from '@/lib/inbox'

export interface InboxCounts { urgent: number; soon: number; info: number }
const RANK: Record<InboxSeverity, number> = { urgent: 0, soon: 1, info: 2 }

export function useInbox() {
  const data = useStore(s => s.data)
  const role = useStore(s => s.role)
  const grants = useStore(s => s.grants)
  const previewMemberId = useStore(s => s.previewMemberId)
  const inboxState = useStore(s => s.inboxState)
  const hasAccess = useStore(s => s.hasAccess)
  const isShareOnly = useStore(s => s.isShareOnly)
  const accessibleClientIds = useStore(s => s.accessibleClientIds)

  return useMemo(() => {
    const empty = { visible: [] as InboxItem[], hidden: [] as InboxItem[], byClient: {} as Record<string, InboxCounts>, total: 0 }
    // grants / previewMemberId change what hasAccess answers, so a change in either re-runs this.
    void grants; void previewMemberId
    if (role === 'artist') return empty
    const ids = accessibleClientIds()
    const clients = ids === 'all' ? data.clients : data.clients.filter(c => ids.includes(c.id))
    const day = today()
    const all = clients
      .flatMap(c => buildInbox(c, day, inboxAccessFor(hasAccess, isShareOnly, c.id)))
      .sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.date ?? '').localeCompare(b.date ?? ''))
    const visible = all.filter(i => !isHidden(inboxState[i.key], day))
    const hidden = all.filter(i => isHidden(inboxState[i.key], day))
    const byClient: Record<string, InboxCounts> = {}
    for (const i of visible) {
      const c = (byClient[i.clientId] ??= { urgent: 0, soon: 0, info: 0 })
      c[i.severity] += 1
    }
    // The badge counts what needs action; heads-ups don't add to it.
    return { visible, hidden, byClient, total: visible.filter(i => i.severity !== 'info').length }
  }, [data, role, grants, previewMemberId, inboxState, hasAccess, isShareOnly, accessibleClientIds])
}
