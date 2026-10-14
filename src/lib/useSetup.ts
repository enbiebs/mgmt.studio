'use client'
// The first-day checklist for one artist, or null when it shouldn't be shown: only managers
// get it (it is about setting the artist up), never on a demo artist, and never while
// previewing as someone else.

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { setupProgress, setupSteps } from '@/lib/setup'
import type { Client } from '@/types'

export function useSetup(client: Client | null | undefined) {
  const role = useStore(s => s.role)
  const previewMemberId = useStore(s => s.previewMemberId)
  const previewMembers = useStore(s => s.previewMembers)
  return useMemo(() => {
    if (!client || client.isDemo || role !== 'manager' || previewMemberId) return null
    const steps = setupSteps(client, { artistHasLogin: previewMembers.some(m => m.role === 'artist' && m.clientId === client.id) })
    return { steps, ...setupProgress(steps) }
  }, [client, role, previewMemberId, previewMembers])
}
