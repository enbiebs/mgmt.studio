'use client'
// The Today list for the signed-in person: their to-dos plus the automatic "needs you" items, for the
// artists they can open. (See lib/tasks.ts for the rules.)

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { useInbox } from '@/lib/useInbox'
import { buildToday, type TodayList } from '@/lib/tasks'
import { today } from '@/lib/utils'

/** The signed-in login's id. While a manager previews the app as a teammate, that teammate's id instead. */
export function useMe(): string | null {
  const userId = useStore(s => s.userId)
  const previewMemberId = useStore(s => s.previewMemberId)
  const people = useStore(s => s.workspacePeople)
  if (!previewMemberId) return userId
  return people.find(p => p.memberId === previewMemberId)?.userId ?? null
}

export function useToday(scope: 'mine' | 'everyone'): { list: TodayList; hiddenAuto: ReturnType<typeof useInbox>['hidden']; me: string | null } {
  const data = useStore(s => s.data)
  const accessibleClientIds = useStore(s => s.accessibleClientIds)
  const grants = useStore(s => s.grants)
  const inbox = useInbox()
  const me = useMe()

  const list = useMemo(() => {
    void grants   // a change in what this person may open re-runs this
    const ids = accessibleClientIds()
    const clients = ids === 'all' ? data.clients : data.clients.filter(c => ids.includes(c.id))
    return buildToday({ clients, inbox: inbox.visible, me, scope, today: today() })
  }, [data, accessibleClientIds, grants, inbox.visible, me, scope])

  return { list, hiddenAuto: inbox.hidden, me }
}

// The artist last used to add a to-do is remembered in this browser (a convenience only).
const LAST_ARTIST_KEY = 'mgmt:todo-last-artist'
const SCOPE_KEY = 'mgmt:today-scope'

export function recallLastArtist(): string | null {
  try { return localStorage.getItem(LAST_ARTIST_KEY) } catch { return null }
}
export function rememberLastArtist(clientId: string): void {
  try { localStorage.setItem(LAST_ARTIST_KEY, clientId) } catch { /* private window: it just won't be remembered */ }
}
export function recallScope(): 'mine' | 'everyone' {
  try { return localStorage.getItem(SCOPE_KEY) === 'everyone' ? 'everyone' : 'mine' } catch { return 'mine' }
}
export function rememberScope(scope: 'mine' | 'everyone'): void {
  try { localStorage.setItem(SCOPE_KEY, scope) } catch { /* private window: it just won't be remembered */ }
}
