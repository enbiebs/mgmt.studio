'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { privateGroupsFor } from '@/lib/profile-fields'
import type { Client } from '@/types'
import { Card } from './FieldsCard'

interface LogRow { id: string; at: string; user_label: string; subject: string; tier: string; action: 'reveal' | 'save'; fields: string[] }
type Load = { clientId: string; rows: LogRow[] | null }

const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Who has looked at, or changed, this artist's private details. The names of the fields, never what they say. */
export function AccessLog({ client }: { client: Client }) {
  const [load, setLoad] = useState<Load | null>(null)

  useEffect(() => {
    let live = true
    createClient().from('profile_access_log')
      .select('id, at, user_label, subject, tier, action, fields')
      .eq('client_id', client.id).order('at', { ascending: false }).limit(60)
      .then(({ data }) => { if (live) setLoad({ clientId: client.id, rows: (data as LogRow[] | null) ?? null }) })
    return () => { live = false }
  }, [client.id])

  const rows = load && load.clientId === client.id ? load.rows : undefined
  const labels = new Map(privateGroupsFor('artist').flatMap(g => g.fields.map(f => [f.key, f.label] as const)))
  const who = (subject: string) => subject === 'artist' ? client.name : client.people.find(p => p.id === subject)?.name ?? 'a removed person'

  return (
    <Card title="Who looked" hint="Every time someone revealed or changed private details. Only the names of the fields are kept, never what they say.">
      {rows === undefined ? <p className="text-sm text-gray-400">Loading…</p>
        : rows === null ? <p className="text-sm text-gray-500">Couldn&apos;t load the history. Refresh and try again.</p>
        : rows.length === 0 ? <p className="text-sm text-gray-500">No one has opened the private details yet.</p>
        : (
          <ul className="divide-y divide-gray-100">
            {rows.map(r => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <span>
                  <b className="font-semibold">{r.user_label}</b>{' '}
                  {r.action === 'reveal' ? 'revealed' : 'changed'} {who(r.subject)}&apos;s private details
                  {r.action === 'save' && r.fields.length > 0 && <span className="text-gray-500"> ({r.fields.map(k => labels.get(k) ?? k).join(', ')})</span>}
                </span>
                <span className="text-xs text-gray-400">{ago(r.at)}</span>
              </li>
            ))}
          </ul>
        )}
    </Card>
  )
}
