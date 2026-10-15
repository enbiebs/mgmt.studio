'use client'
// Talks to the server routes that keep an artist's private details. What comes back is held only by the
// component that asked for it (never in the app's shared data, never in browser storage), and goes away
// when that component is hidden or closed.
import { useCallback, useEffect, useState } from 'react'

export interface SecureSummary { configured: boolean; subjects: Record<string, string[]> }
type Load = { clientId: string; ok: true; summary: SecureSummary } | { clientId: string; ok: false }
type Reply<T> = { ok: true; data: T } | { ok: false; error: string; status: number }

async function post<T>(url: string, body: unknown): Promise<Reply<T>> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return { ok: false, error: (j as { error?: string }).error ?? 'Something went wrong', status: r.status }
    return { ok: true, data: j as T }
  } catch {
    return { ok: false, error: 'Could not reach the server', status: 0 }
  }
}

export function useProfileSecure(clientId: string) {
  const [load, setLoad] = useState<Load | null>(null)

  useEffect(() => {
    if (!clientId) return
    let live = true
    post<SecureSummary>('/api/profile/secure/fields', { clientId }).then(r => {
      if (live) setLoad(r.ok ? { clientId, ok: true, summary: r.data } : { clientId, ok: false })
    })
    return () => { live = false }
  }, [clientId])

  const current = load && load.clientId === clientId ? load : null

  const reveal = useCallback(async (subject: string): Promise<Reply<Record<string, string>>> => {
    const r = await post<{ data: Record<string, string> }>('/api/profile/secure/read', { clientId, subject, tier: 'private' })
    return r.ok ? { ok: true, data: r.data.data } : r
  }, [clientId])

  const save = useCallback(async (subject: string, set: Record<string, string>): Promise<Reply<string[]>> => {
    const r = await post<{ fields: string[] }>('/api/profile/secure/save', { clientId, subject, tier: 'private', set })
    if (!r.ok) return r
    setLoad(l => (l && l.clientId === clientId && l.ok ? { ...l, summary: { ...l.summary, subjects: { ...l.summary.subjects, [subject]: r.data.fields } } } : l))
    return { ok: true, data: r.data.fields }
  }, [clientId])

  return {
    loading: clientId !== '' && current === null,
    failed: current !== null && !current.ok,
    summary: current && current.ok ? current.summary : null,
    reveal,
    save,
  }
}
export type ProfileSecure = ReturnType<typeof useProfileSecure>
