'use client'
import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { uid } from '@/lib/utils'
import type { Person } from '@/types'
import { ADMIN_KEY, LEVELS, SECTIONS, matchPreset, otherAccess, planChanges, presetByKey, summarize, levelsOf, type GrantRow } from '@/lib/access-presets'
import { levelChangeWarning } from '@/lib/sharing'
import { applyGrantPlan } from '@/lib/db'
import type { AccessPreset } from '@/lib/access-presets'
import { RoleMenu } from './RoleMenu'
import { InviteForm } from './InviteForm'

type Level = 'none' | 'view' | 'edit'

/** The "take everything away" choice, shown first in this panel's role menu. */
const NO_ACCESS: AccessPreset = { key: 'none', label: 'No access', blurb: 'Takes away everything they have for this artist.', hidden: 'Everything', levels: {} }
const PANEL_OPTIONS: AccessPreset[] = [NO_ACCESS, ...LEVELS]
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
  const afterAccessChange = useStore(s => s.afterAccessChange)
  const [loading, setLoading] = useState(true)
  const [member, setMember] = useState<Member>(null)
  const [grants, setGrants] = useState<GrantRow[]>([])
  const clientId = useStore(s => s.clientId)
  const waiting = useStore(s => !!s.workspacePeople.find(p => p.memberId === member?.id)?.invited)

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

  // Choose a ready-made level for one artist: fills in the same per-section choices the chips below show.
  const [levelMessage, setLevelMessage] = useState<Record<string, string>>({})
  async function applyLevel(clientId: string, key: string) {
    if (!member) return
    const levels = key === 'none' ? {} : presetByKey(key)?.levels
    if (!levels) return
    const warning = levelChangeWarning(matchPreset(grants, clientId), key, { isMe: false, isManager: true })
    if (warning && !confirm(`${warning} Continue?`)) return
    const plan = planChanges(grants, clientId, levels, key === ADMIN_KEY)
    try {
      await applyGrantPlan(member.id, clientId, plan, grants.filter(g => g.section === ADMIN_KEY && g.client_id === clientId).map(g => g.id))
      setLevelMessage(m => ({ ...m, [clientId]: '' }))
    } catch (e) {
      console.error(e)
      setLevelMessage(m => ({ ...m, [clientId]: "Couldn't change their access. Please try again." }))
    }
    fetchAccess(person.id).then(r => setGrants(r.grants))   // always show what is really saved
    void afterAccessChange(member.id)
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
    void afterAccessChange(member.id)
  }

  if (!isManager) return null

  if (loading) {
    return <div className="text-xs text-gray-300 py-2">Checking login status…</div>
  }

  if (!member) {
    return (
      <div className="pt-1 border-t border-gray-100 mt-3">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5 mt-3">Access</div>
        <div className="text-xs text-gray-500 mb-3">No login yet. Invite {person.name} to log in, and choose what they can see before you send it.</div>
        {clientId && <InviteForm person={person} defaultClientId={clientId} />}
      </div>
    )
  }

  return (
    <div className="pt-1 border-t border-gray-100 mt-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 mt-3">
        Access — {waiting ? 'invited, waiting to accept' : 'has a real login'}
      </div>
      {waiting && (
        <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-2 mb-2">
          They haven&apos;t accepted the invitation yet. The access below is already set up and starts when they do.
        </div>
      )}
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
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <div className="text-xs font-semibold flex-1 min-w-0 basis-32 truncate">{c.name}</div>
              <div className="w-full sm:w-64 sm:flex-none">
                <RoleMenu
                  ariaLabel={`Access level for ${c.name}`} options={PANEL_OPTIONS}
                  value={current} shownAs={current === 'custom' ? 'Custom (fine-tuned)' : undefined}
                  onChange={key => applyLevel(c.id, key)}
                />
              </div>
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
