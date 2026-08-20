'use client'
import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { uid } from '@/lib/utils'
import { inputClass, selectClass } from '@/components/ui/Modal'
import type { Person } from '@/types'

const SECTIONS: { key: string; label: string }[] = [
  { key: 'music', label: 'Music' },
  { key: 'tour', label: 'Tour' },
  { key: 'content', label: 'Content' },
  { key: 'business', label: 'Business' },
  { key: 'team', label: 'Team' },
  { key: 'projects', label: 'Projects' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'fandom', label: 'Fandom' },
  { key: 'legal', label: 'Legal' },
]

type Level = 'none' | 'view' | 'edit'
type GrantRow = { id: string; section: string; client_id: string | null; can_edit: boolean }
type Member = { id: string; role: string } | null

function levelOf(grants: GrantRow[], section: string, clientId: string): Level {
  const g = grants.find(g => g.section === section && g.client_id === clientId)
  if (!g) return 'none'
  return g.can_edit ? 'edit' : 'view'
}

export function AccessPanel({ person }: { person: Person }) {
  const clients = useStore(s => s.data.clients)
  // Invite-sending and grant management are manager-exclusive at the RLS
  // level (access_grants select/insert/update/delete all check role =
  // 'manager'), so a non-manager querying this would just get empty
  // results back — hide the panel entirely instead of showing a
  // misleading "no login yet" state.
  const isManager = useStore(s => s.role === 'manager')
  const [loading, setLoading] = useState(true)
  const [member, setMember] = useState<Member>(null)
  const [grants, setGrants] = useState<GrantRow[]>([])
  const [inviteEmail, setInviteEmail] = useState(person.email ?? '')
  const [inviteRole, setInviteRole] = useState<'team' | 'agent' | 'lawyer'>('team')
  const [inviting, setInviting] = useState(false)
  const [inviteMessage, setInviteMessage] = useState<string | null>(null)

  async function fetchAccess(personId: string): Promise<{ member: Member; grants: GrantRow[] }> {
    if (!isManager) return { member: null, grants: [] }
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const { data: wm } = await supabase
      .from('workspace_members').select('id, role').eq('person_id', personId).maybeSingle()
    if (!wm) return { member: null, grants: [] as GrantRow[] }
    const { data: g } = await supabase
      .from('access_grants').select('id, section, client_id, can_edit').eq('workspace_member_id', wm.id)
    return { member: wm, grants: g ?? [] }
  }

  useEffect(() => {
    fetchAccess(person.id).then(({ member, grants }) => {
      setMember(member)
      setGrants(grants)
      setLoading(false)
    })
  }, [person.id, isManager])

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setInviteMessage(null)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, personId: person.id }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Could not send invite')
      setInviteMessage(`Invite sent to ${inviteEmail.trim()}. They'll show up here once they accept.`)
    } catch (e) {
      setInviteMessage(e instanceof Error ? e.message : 'Could not send invite')
    } finally {
      setInviting(false)
    }
  }

  async function cycleGrant(clientId: string, section: string) {
    if (!member) return
    const current = levelOf(grants, section, clientId)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const existing = grants.find(g => g.section === section && g.client_id === clientId)

    if (current === 'none') {
      const row = { id: 'grant-' + uid(), workspace_member_id: member.id, section, client_id: clientId, can_edit: false }
      await supabase.from('access_grants').insert(row)
      setGrants(g => [...g, row])
    } else if (current === 'view' && existing) {
      await supabase.from('access_grants').update({ can_edit: true }).eq('id', existing.id)
      setGrants(g => g.map(row => row.id === existing.id ? { ...row, can_edit: true } : row))
    } else if (existing) {
      await supabase.from('access_grants').delete().eq('id', existing.id)
      setGrants(g => g.filter(row => row.id !== existing.id))
    }
  }

  if (!isManager) return null

  if (loading) {
    return <div className="text-xs text-gray-300 py-2">Checking login status…</div>
  }

  if (!member) {
    return (
      <div className="pt-1 border-t border-gray-100 mt-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 mt-3">Access</div>
        <div className="text-xs text-gray-400 mb-2">No login yet — invite them to access Mgmt Studio directly.</div>
        <div className="flex gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <input className={inputClass} type="email" placeholder="Email to invite" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
          </div>
          <div className="w-28 flex-shrink-0">
            <select className={selectClass} value={inviteRole} onChange={e => setInviteRole(e.target.value as typeof inviteRole)}>
              <option value="team">Team</option>
              <option value="agent">Agent</option>
              <option value="lawyer">Lawyer</option>
            </select>
          </div>
          <button
            type="button" onClick={sendInvite} disabled={inviting}
            className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50 flex-shrink-0"
          >
            {inviting ? 'Sending…' : 'Invite'}
          </button>
        </div>
        {inviteMessage && <div className="text-xs text-gray-500">{inviteMessage}</div>}
      </div>
    )
  }

  return (
    <div className="pt-1 border-t border-gray-100 mt-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 mt-3">
        Access — has a real login
      </div>
      <div className="text-xs text-gray-400 mb-2">
        Click a section to grant view, click again for edit, click again to remove. Default is view-only.
      </div>
      <div className="flex flex-col gap-3">
        {clients.map(c => (
          <div key={c.id}>
            <div className="text-xs font-semibold mb-1">{c.name}</div>
            <div className="flex flex-wrap gap-1">
              {SECTIONS.map(s => {
                const level = levelOf(grants, s.key, c.id)
                const cls = level === 'edit'
                  ? 'bg-blue-500 text-white'
                  : level === 'view'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => cycleGrant(c.id, s.key)}
                    className={`px-2 py-1 rounded-full text-[10px] font-semibold transition-colors ${cls}`}
                    title={level === 'none' ? 'No access' : level === 'view' ? 'View only' : 'Can edit'}
                  >
                    {s.label}{level === 'edit' ? ' ✎' : ''}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
