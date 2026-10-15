'use client'
// ──────────────────────────────────────────────────────────
//  "Add a team member": ONE door, email first. The email decides what happens next, so nobody can end up with a
//  duplicate card or an invitation that can only be refused:
//    already on this artist's team   -> says so (open their card instead)
//    already has a login (any artist) -> no invitation: pick what they can open for this artist and they are added
//    a manager                        -> they can already open every artist
//    someone on another artist's team -> their details are filled in
//    brand new                        -> add them, then the invite step
//  People are recognised by email: a login and a team card with the same email are the same person.
// ──────────────────────────────────────────────────────────
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import { ADMIN_KEY, levelsForRole, planChanges } from '@/lib/access-presets'
import { POINT_PERSON_WARNING, withCardNames } from '@/lib/sharing'
import { applyGrantPlan } from '@/lib/db'
import { MAX_TITLE_CHARS, TITLE_SUGGESTIONS, cleanTitle } from '@/lib/team-roles'
import { RoleMenu } from './RoleMenu'
import type { ArtistSharing } from './useArtistSharing'
import type { Person } from '@/types'

const EMAIL_OK = /^\S+@\S+\.\S+$/
const normal = (e?: string) => e?.trim().toLowerCase() ?? ''

export function AddPersonModal({ initialTitle, sharing, canInvite, onInvite, onOpenCard, onClose }: {
  initialTitle?: string
  sharing: ArtistSharing
  /** A manager can send an invitation straight after adding someone new. */
  canInvite: boolean
  onInvite: (personId: string) => void
  onOpenCard: (personId: string) => void
  onClose: () => void
}) {
  const client = useStore(s => s.getClient())
  const clients = useStore(s => s.data.clients)
  const rawLogins = useStore(s => s.workspacePeople)
  const addPerson = useStore(s => s.addPerson)
  const afterAccessChange = useStore(s => s.afterAccessChange)

  const [email, setEmail] = useState('')
  // null = not typed yet, so the box shows what was found for the email
  const [name, setName] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [phone, setPhone] = useState<string | null>(null)
  const [org, setOrg] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [roleKey, setRoleKey] = useState('')
  const [confirmPoint, setConfirmPoint] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const logins = withCardNames(rawLogins, clients)
  const key = normal(email)
  const emailOk = EMAIL_OK.test(key)
  const here = emailOk ? client?.people.find(p => normal(p.email) === key) : undefined
  let elsewhere: { person: Person; artist: string } | undefined
  if (emailOk && !here) {
    for (const c of clients) {
      if (c.id === client?.id || c.isDemo) continue
      const p = (c.people ?? []).find(x => normal(x.email) === key)
      if (p) { elsewhere = { person: p, artist: c.name }; break }
    }
  }
  const login = emailOk ? logins.find(l => l.email === key && l.role !== 'artist') : undefined
  const isManager = login?.role === 'manager'
  const existing = login && !isManager ? login : undefined
  const row = existing ? sharing.rows.find(r => r.person.memberId === existing.memberId) : undefined
  const hasAccess = (row?.kind === 'person' && row.grants.length > 0) || row?.kind === 'company'

  const found = elsewhere?.person
  const nameShown = name ?? found?.name ?? (existing && !existing.label.includes('@') ? existing.label : '')
  const titleShown = title ?? found?.title ?? initialTitle ?? ''
  const phoneShown = phone ?? found?.phone ?? ''
  const orgShown = org ?? found?.org ?? ''

  function newCard() {
    return addPerson({
      name: nameShown.trim(), title: cleanTitle(titleShown), email: email.trim() || undefined,
      phone: phoneShown.trim() || undefined, org: orgShown.trim() || undefined, notes: notes.trim() || undefined,
    })
  }

  /** Someone who already has a login: add their card here and give them the chosen role. No invitation is sent. */
  async function addExisting() {
    if (!existing || !client || busy || !nameShown.trim()) return
    const point = roleKey === ADMIN_KEY
    if (!hasAccess && point && !confirmPoint) { setConfirmPoint(true); return }
    setBusy(true); setError('')
    try {
      if (!hasAccess && roleKey) {
        await applyGrantPlan(existing.memberId, client.id, planChanges([], client.id, point ? {} : levelsForRole(roleKey), point))
      }
      newCard()
      try { await sharing.reload(); await afterAccessChange(existing.memberId) } catch (e) { console.error(e) }
      onClose()
    } catch (e) {
      console.error(e)
      setError("That could not be saved. Please try again.")
      setBusy(false)
    }
  }

  function addNew() {
    if (!nameShown.trim()) return
    const id = newCard()
    if (canInvite && emailOk) onInvite(id)
    onClose()
  }

  const blocked = !!here || isManager
  const primaryLabel = blocked ? 'Add'
    : existing
    ? (hasAccess ? 'Add their card' : confirmPoint ? 'Yes, make them a Point Person' : 'Add and give access')
    : canInvite && emailOk ? 'Add, then invite →' : 'Add'
  const primaryReady = !!nameShown.trim() && !blocked && (!existing || hasAccess || roleKey !== '')

  return (
    <Modal title="Add a team member" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button
          onClick={() => existing ? void addExisting() : addNew()} disabled={!primaryReady || busy}
          className="px-3 py-1.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? 'Saving…' : primaryLabel}
        </button>
      </>
    }>
      <FormField label="Email">
        <input
          className={inputClass} type="email" placeholder="name@company.com" value={email} autoFocus
          onChange={e => { setEmail(e.target.value); setConfirmPoint(false); setError('') }}
        />
      </FormField>

      {here && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p>{here.name} is already on {client?.name}&apos;s team with this email.</p>
          <button onClick={() => { onClose(); onOpenCard(here.id) }} className="mt-1 font-medium underline">Open their card</button>
        </div>
      )}
      {isManager && (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">That is a manager. Managers can already open every artist, so there is nothing to add.</p>
      )}
      {existing && !here && (
        <div className="space-y-2 rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-900">
          <p>
            <strong>{existing.label}</strong> already has a login{existing.invited ? ' (invited, has not signed in yet)' : ''}. No invitation is needed.
            {hasAccess ? ` They can already open ${client?.name}; this only adds their card.` : ` Choose what they can open for ${client?.name}:`}
          </p>
          {!hasAccess && (
            <div className="bg-canvas rounded-lg">
              <RoleMenu ariaLabel={`Role for ${existing.label}`} value={roleKey} onChange={k => { setRoleKey(k); setConfirmPoint(false) }} busy={busy} />
            </div>
          )}
          {confirmPoint && <p role="alert" className="rounded-lg bg-amber-50 px-2.5 py-2 text-amber-900">{POINT_PERSON_WARNING}</p>}
        </div>
      )}
      {elsewhere && !existing && !here && (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">Their details were filled in from {elsewhere.artist}&apos;s team.</p>
      )}

      <FormField label="Name">
        <input className={inputClass} placeholder="Full name" value={nameShown} onChange={e => setName(e.target.value)} />
      </FormField>
      <FormField label="Title / role">
        <input
          className={inputClass} list="team-title-suggestions" placeholder="e.g. Tour Manager, Stylist, Business manager"
          maxLength={MAX_TITLE_CHARS} value={titleShown} onChange={e => setTitle(e.target.value)}
        />
        <datalist id="team-title-suggestions">{TITLE_SUGGESTIONS.map(t => <option key={t} value={t} />)}</datalist>
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Phone"><input className={inputClass} value={phoneShown} onChange={e => setPhone(e.target.value)} /></FormField>
        <FormField label="Org / company"><input className={inputClass} value={orgShown} onChange={e => setOrg(e.target.value)} /></FormField>
      </div>
      <FormField label="Notes"><input className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} /></FormField>

      {!existing && !blocked && !emailOk && (
        <p className="text-xs text-gray-500">
          {canInvite ? 'Add their email to send them an invitation. Without one they are added as a contact only (you can invite them later).' : 'Add their email so they are recognised if they join later.'}
        </p>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </Modal>
  )
}
