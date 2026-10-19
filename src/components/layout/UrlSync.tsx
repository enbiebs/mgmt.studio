'use client'
// Keeps the address bar and the screen in step (the rules are in lib/url-sync.ts). Renders nothing.
import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { startUrlSync } from '@/lib/url-sync'

export function UrlSync() {
  const role = useStore(s => s.role)

  useEffect(() => {
    if (role === 'artist') return            // an artist has one page (their portal), so there is nothing to address
    return startUrlSync(window)
  }, [role])

  return null
}
