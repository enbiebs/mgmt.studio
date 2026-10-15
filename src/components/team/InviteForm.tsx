'use client'
// ──────────────────────────────────────────────────────────
//  Invite someone to log in, choosing everything about their access up front: role, level, pages and which artists.
//  The invitation carries that choice, so when they accept it is already waiting for them. Managers only for now (the
//  server enforces it); the database checks what arrives and ignores anything it should not honor.
// ──────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { inputClass } from '@/components/ui/Modal'
import { ADMIN_KEY, cyclePage, levelsForRole, overallLevel, presetByKey, setAllPages, summarize, type PageLevels, type SectionKey } from '@/lib/access-presets'
import { inviteIsEmpty, loginTypeFor, type InviteArtistAccess } from '@/lib/invite-access'
import { upsertPerson } from '@/lib/db'
import type { Person } from '@/types'
import { RoleMenu } from './RoleMenu'
import { PagesPanel } from './PagesPanel'

const LABEL = 'mb-1.5 text-[10px] font-bold uppercase tracking-widest text-gray-500'

export function InviteForm({ person, defaultClientId, onSent }: {
  /** The team member being invited: add them to the team first, then invite them. */
  person: Person
  defaultClientId: string
  onSent?: () => void
}) {
  const clients = useStore(s => s.data.clients)
  const artists = useMemo(() => clients.filter(c => !c.isDemo), [clients])
  const afterAccessChange = useStore(s => s.afterAccessChange)

  const [email, setEmail] = useState(person.email ?? '')
  const [roleKey, setRoleKey] = useState('')
  const [levels, setLevels] = useState<PageLevels>({})
  const [pointPerson, setPointPerson] = useState(false)
  // a demo artist is private to its owner and can't be invited to, so it is never pre-selected
  const [chosen, setChosen] = useState<string[]>(() => artists.some(a => a.id === defaultClientId) ? [defaultClientId] : [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  function chooseRole(key: string) {
    setRoleKey(key); setError(''); setDone('')
    setPointPerson(key === ADMIN_KEY)
    setLevels(key === ADMIN_KEY ? {} : levelsForRole(key))
  }
  function makePointPerson() { setPointPerson(true); setLevels({}); setRoleKey(ADMIN_KEY) }
  function leavePointPerson(level: 'view' | 'edit') {
    // from Point Person back to pages: start from the role's own pages (or the chosen role) at that level
    const base = pointPerson ? levelsForRole(roleKey === ADMIN_KEY ? 'assistant' : roleKey) : levels
    setPointPerson(false); setLevels(setAllPages(base, level))
    if (roleKey === ADMIN_KEY) setRoleKey('assistant')
  }
  function setAll(level: 'view' | 'edit') {
    if (pointPerson || overallLevel(levels) === 'none') { leavePointPerson(level); return }
    setLevels(setAllPages(levels, level))
  }
  const toggleArtist = (id: string) => setChosen(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id])

  const access: InviteArtistAccess[] = chosen.map(clientId => ({
    clientId, pointPerson,
    levels: Object.fromEntries(Object.entries(levels).filter(([, l]) => l === 'view' || l === 'edit')) as InviteArtistAccess['levels'],
  }))
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim())
  const ready = emailOk && roleKey !== '' && chosen.length > 0 && !inviteIsEmpty(access)
  const roleName = presetByKey(roleKey)?.label

  async function send() {
    if (!ready || busy) return
    setBusy(true); setError(''); setDone('')
    try {
      const store = useStore.getState()
      if (email.trim() !== (person.email ?? '')) store.updatePerson(person.id, { email: email.trim() })
      // make sure the team member's card is saved before the server looks for it
      const current = store.getClient(defaultClientId)?.people.find(p => p.id === person.id)
      if (current) await upsertPerson(current, defaultClientId)
      const res = await fetch('/api/team/invite', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), role: loginTypeFor(roleKey), personId: person.id, access }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not send that invitation')
      setDone(json.warning ?? `Invitation sent to ${email.trim()}. Their access is already set up and starts when they accept.`)
      await afterAccessChange()
      onSent?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that invitation')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className={LABEL}>Email to invite</span>
        <input className={inputClass} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
      </label>

      <div>
        <div className={LABEL}>1. Role</div>
        <RoleMenu value={roleKey} onChange={chooseRole} ariaLabel="Role" />
      </div>

      <div>
        <div className={LABEL}>2. Access level and pages {roleKey && <span className="font-normal normal-case tracking-normal text-gray-400">(filled in by the role, change any)</span>}</div>
        <PagesPanel
          levels={levels} pointPerson={pointPerson} disabled={busy}
          onCycle={(s: SectionKey) => setLevels(l => cyclePage(l, s))}
          onSetAll={setAll} onPointPerson={makePointPerson}
        />
        <p className="mt-2 text-xs text-gray-600">
          {pointPerson
            ? 'A Point Person can see and change everything for these artists, including money, contracts and private details, and can decide who else has access.'
            : inviteIsEmpty(access) ? 'Pick a role to fill in the pages, then change any of them.' : `${summarize(levels)}.`}
        </p>
      </div>

      {artists.length > 1 && (
        <div>
          <div className={LABEL}>3. Which artists</div>
          <div className="flex flex-wrap gap-1.5">
            {artists.map(a => {
              const on = chosen.includes(a.id)
              return (
                <button
                  key={a.id} type="button" onClick={() => toggleArtist(a.id)} aria-pressed={on} disabled={busy}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${on ? 'bg-accent text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {on ? '✓ ' : ''}{a.name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3">
        <p className="min-w-0 flex-1 basis-56 text-xs text-gray-500">
          They get an email invite{roleName ? ` as ${roleName}` : ''}. When they accept, this access is already waiting for them.
        </p>
        <button
          type="button" onClick={() => void send()} disabled={!ready || busy}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send invite'}
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
      {done && <p role="status" className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">{done}</p>}
    </div>
  )
}
