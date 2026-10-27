'use client'
// Keeps the address bar and the screen in step (the rules are in lib/url-sync.ts), and keeps the number of things that need action in the
// tab's title (lib/tab-title.ts). Renders nothing.
import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { startUrlSync } from '@/lib/url-sync'
import { useTodayBadge } from '@/lib/useInbox'
import { setTabCount, wantedTitle } from '@/lib/tab-title'

export function UrlSync() {
  const role = useStore(s => s.role)
  // The same number as the Today link in the side rail (all artists, or just the open artist's), so the tab and the page agree.
  const needAction = useTodayBadge(useStore(s => s.view) === 'studio', useStore(s => s.clientId))

  useEffect(() => {
    if (role === 'artist') return            // an artist has one page (their portal), so there is nothing to address
    return startUrlSync(window)
  }, [role])

  // Next writes its own plain title when the page first loads, wiping ours: put ours back whenever that happens.
  useEffect(() => {
    if (role === 'artist') return
    const obs = new MutationObserver(() => { const want = wantedTitle(); if (want && document.title !== want) document.title = want })
    obs.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => obs.disconnect()
  }, [role])

  // After the address-sync effect above, so the first title it writes already carries the number.
  useEffect(() => {
    if (role !== 'artist') setTabCount(document, needAction)
  }, [role, needAction])

  return null
}
