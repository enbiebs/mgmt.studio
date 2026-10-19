'use client'
// The cash forecast for the signed-in person: for the artist that is open, and (for Home) for every artist they can see
// money for. Money needs Finance access, so an artist's own login, or someone without Finance for an artist, gets nothing
// for that artist. A demo artist is left out of the roll-up: its figures are made up, so they must never be added into real cash.

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { today } from '@/lib/utils'
import { buildForecast, type ForecastItem } from '@/lib/forecast'

/** The forecast for the open artist. */
export function useArtistForecast(includeHolds: boolean): ForecastItem[] {
  const client = useStore(s => s.getClient())
  return useMemo(() => (client ? buildForecast(client, today(), { includeHolds }) : []), [client, includeHolds])
}

export interface ForecastGroup { workspaceId: string | null; name: string; items: ForecastItem[] }

/** Everything expected across the artists this person can see money for, grouped by company (never mixed across companies). */
export function useForecastRollup(): ForecastGroup[] {
  const data = useStore(s => s.data)
  const role = useStore(s => s.role)
  const grants = useStore(s => s.grants)
  const previewMemberId = useStore(s => s.previewMemberId)
  const hasAccess = useStore(s => s.hasAccess)
  const accessibleClientIds = useStore(s => s.accessibleClientIds)
  const contexts = useStore(s => s.contexts)
  const clientWorkspace = useStore(s => s.clientWorkspace)
  const companyName = useStore(s => s.companyName)
  const workspaceId = useStore(s => s.workspaceId)

  return useMemo(() => {
    void grants; void previewMemberId     // they change what hasAccess answers, so a change re-runs this
    if (role === 'artist') return []
    const ids = accessibleClientIds()
    const clients = (ids === 'all' ? data.clients : data.clients.filter(c => ids.includes(c.id))).filter(c => !c.isDemo && hasAccess('finance', c.id))
    const day = today()
    const groups = new Map<string | null, ForecastGroup>()
    for (const c of clients) {
      const ws = clientWorkspace[c.id] ?? workspaceId ?? null
      const g = groups.get(ws) ?? { workspaceId: ws, name: (ws && contexts[ws]?.companyName) || companyName || 'Your company', items: [] }
      g.items.push(...buildForecast(c, day))
      groups.set(ws, g)
    }
    return [...groups.values()].filter(g => g.items.length > 0)
  }, [data, role, grants, previewMemberId, hasAccess, accessibleClientIds, contexts, clientWorkspace, companyName, workspaceId])
}
