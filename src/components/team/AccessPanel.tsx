'use client'
import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { uid } from '@/lib/utils'
import { inputClass, selectClass } from '@/components/ui/Modal'
import type { Person } from '@/types'
import { ARTIST_SIDE_NAME } from '@/lib/brand'
import { ADMIN_KEY, LEVELS, SECTIONS, matchPreset, otherAccess, planChanges, presetByKey, summarize, levelsOf, type GrantRow } from '@/lib/access-presets'

type Level = 'none' | 'view' | 'edit'
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

  // Choose a ready-made level for one artist: fills in the same per-section choices the chips below show.
  const [levelMessage, setLevelMessage] = useState<Record<string, string>>({})
  async function applyLevel(clientId: string, key: string) {
    if (!member) return
    const levels = key === 'none' ? {} : presetByKey(key)?.levels
    if (!levels) return
    if (matchPreset(grants, clientId) === 'custom' && !confirm('This replaces the choices you made for this artist. Continue?')) return
    if (key === ADMIN_KEY && !confirm('A Point Person can see and change everything for this artist, including money, contracts and private details, and can decide who else has access. Continue?')) return
    const plan = planChanges(grants, clientId, levels, key === ADMIN_KEY)
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const added = plan.add.map(a => ({ id: 'grant-' + uid(), workspace_member_id: member.id, section: a.section, client_id: clientId, can_edit: a.canEdit }))
    const results = await Promise.all([
      plan.remove.length ? supabase.from('access_grants').delete().in('id', plan.remove) : null,
      ...plan.update.map(u => supabase.from('access_grants').update({ can_edit: u.canEdit }).eq('id', u.id)),
      added.length ? supabase.from('access_grants').insert(added) : null,
    ])
    if (results.some(r => r?.error)) {
      setLevelMessage(m => ({ ...m, [clientId]: "Couldn't change their access. Please try again." }))
      fetchAccess(person.id).then(r => setGrants(r.grants))   // show what is really saved
      return
    }
    setLevelMessage(m => ({ ...m, [clientId]: '' }))
    setGrants(g => [
      ...g.filter(row => !plan.remove.includes(row.id)).map(row => {
        const u = plan.update.find(x => x.id === row.id)
        return u ? { ...row, can_edit: u.canEdit } : row
      }),
      ...added.map(({ id, section, client_id, can_edit }) => ({ id, section, client_id, can_edit })),
    ])
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
        <div className="text-xs text-gray-400 mb-2">No login yet — invite them to their own {ARTIST_SIDE_NAME} page.</div>
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
            className="px-3 py-1.5 bg-accent text-white text-xs font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 flex-shrink-0"
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
      {grants.length === 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 mb-2">
          They can log in, but they can&apos;t see anything yet. Pick a level for each artist below.
        </div>
      )}
      <div className="text-xs text-gray-400 mb-2">
        Pick a level for each artist, then fine-tune any section below it: click once for view, again for edit, again to remove.
      </div>
      <div className="flex flex-col gap-4">
        {clients.filter(c => !c.isDemo).map(c => {
          const current = matchPreset(grants, c.id)
          const preset = presetByKey(current)
          return (
          <div key={c.id}>
            <div className="flex items-center gap-2 mb-1">
              <div className="text-xs font-semibold flex-1 min-w-0 truncate">{c.name}</div>
              <select
                aria-label={`Access level for ${c.name}`}
                value={current}
                onChange={e => { if (e.target.value !== 'custom') applyLevel(c.id, e.target.value) }}
                className="px-2 py-1 text-xs bg-gray-50 border border-gray-100 rounded-lg text-gray-600 hover:border-gray-200 max-w-[190px]"
              >
                <option value="none">No access</option>
                {LEVELS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
                {current === 'custom' && <option value="custom" disabled>Custom (fine-tuned)</option>}
              </select>
            </div>
            <div className="text-[11px] text-gray-400 mb-1.5">
              {preset ? `${preset.blurb} Can't see: ${preset.hidden}.` : current === 'custom' ? summarize(levelsOf(grants, c.id)) : 'Cannot see anything for this artist.'}
            </div>
            {otherAccess(grants, c.id).length > 0 && (
              <div className="text-[11px] text-amber-700 mb-1">Also has: {otherAccess(grants, c.id).join(', ')}. Choosing a level here doesn&apos;t change these.</div>
            )}
            {levelMessage[c.id] && <div className="text-[11px] text-red-500 mb-1">{levelMessage[c.id]}</div>}
            {current === ADMIN_KEY ? (
              <div className="text-[11px] text-gray-400">Every page is included, so there is nothing to pick one by one. To limit them, choose another level above.</div>
            ) : (
            <div className="flex flex-wrap gap-1">
              {SECTIONS.map(s => {
                const level = levelOf(grants, s.key, c.id)
                const cls = level === 'edit'
                  ? 'bg-accent text-white'
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
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}
