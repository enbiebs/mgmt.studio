'use client'
// ──────────────────────────────────────────────────────────
//  Company: everyone in the company down the side, every artist across the top, and each person's role for each artist in
//  the cell. A manager sets the whole roster's access from here; it is the same data and the same rules as an artist's
//  Team page (a change made in one place shows in the other). Managers only: the database enforces who may change what.
// ──────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, inputClass } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ADMIN_KEY, LEVELS, planChanges, presetByKey } from '@/lib/access-presets'
import { buildCompanyGrid, groupNamesOf, hasNothing, type CompanyGroup, type CompanyRow } from '@/lib/company'
import { levelChangeWarning, removalWarning, resendWording, withCardNames, type SharingGrant } from '@/lib/sharing'
import { applyGrantPlan, fetchArtistGrants, loadGroups, renameCompany, revokeArtistAccess, setCompanyAdmin, setGroupMembers } from '@/lib/db'
import { GroupsPanel } from './GroupsPanel'
import { InviteForm } from '@/components/team/InviteForm'

type Pending = { memberId: string; clientId: string; key: string; text: string }
const NONE = 'none'

export function CompanyView() {
  const workspaceId = useStore(s => s.workspaceId)
  const rawPeople = useStore(s => s.workspacePeople)
  const clients = useStore(s => s.data.clients)
  const people = useMemo(() => withCardNames(rawPeople, clients), [rawPeople, clients])
  const myMemberId = useStore(s => s.myMemberId)
  const ownerId = useStore(s => s.companyOwnerId)
  const userId = useStore(s => s.userId)
  const isOwner = !!ownerId && ownerId === userId
  const isManager = useStore(s => s.role === 'manager' && s.previewMemberId === null)
  const afterAccessChange = useStore(s => s.afterAccessChange)
  const openClient = useStore(s => s.openClient)
  const setSection = useStore(s => s.setSection)

  const artists = useMemo(() => clients.filter(c => !c.isDemo), [clients])
  const artistKey = artists.map(a => a.id).join('|')

  const [grants, setGrants] = useState<Record<string, SharingGrant[]> | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<Pending | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [groups, setGroups] = useState<CompanyGroup[]>([])
  const [adminPending, setAdminPending] = useState<{ memberId: string; admin: boolean; label: string } | null>(null)
  const [adminProblem, setAdminProblem] = useState('')

  const reloadOne = useCallback(async (clientId: string) => {
    const g = await fetchArtistGrants(clientId)
    setGrants(prev => ({ ...(prev ?? {}), [clientId]: g }))
  }, [])
  // read everyone's access for every artist, again whenever the team list changes (someone was invited or a change saved)
  useEffect(() => {
    if (!isManager) return
    let live = true
    Promise.all(artists.map(async a => [a.id, await fetchArtistGrants(a.id)] as const))
      .then(pairs => { if (live) { setGrants(Object.fromEntries(pairs)); setLoadError(false) } })
      .catch(e => { console.error(e); if (live) setLoadError(true) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `artists` is rebuilt every render; its ids are the real input
  }, [artistKey, people, isManager])
  // the team list was read when the app opened; someone may have joined since
  useEffect(() => { if (isManager) void afterAccessChange() }, [isManager, afterAccessChange])
  const reloadGroups = useCallback(async () => { setGroups(await loadGroups()) }, [])
  useEffect(() => { if (isManager) reloadGroups().catch(console.error) }, [isManager, people, reloadGroups])

  const grid = useMemo(() => buildCompanyGrid(people, grants ?? {}, artists.map(a => a.id)), [people, grants, artists])

  if (!isManager) {
    return <div className="flex-1 overflow-auto p-6 text-sm text-gray-500">Only a manager can open the Company page.</div>
  }

  const keyOf = (memberId: string, clientId: string) => `${memberId}:${clientId}`
  const adminIdsOf = (row: CompanyRow, clientId: string) => row.cells[clientId].grants.filter(g => g.section === ADMIN_KEY).map(g => g.id)

  async function commit(row: CompanyRow, clientId: string, key: string) {
    const id = row.person.memberId
    setBusy(keyOf(id, clientId)); setPending(null)
    setProblem(p => ({ ...p, [id]: '' })); setNotice(n => ({ ...n, [id]: '' }))
    try {
      if (key === NONE) await revokeArtistAccess(id, clientId)
      else await applyGrantPlan(id, clientId, planChanges(row.cells[clientId].grants, clientId, presetByKey(key)?.levels ?? {}, key === ADMIN_KEY), adminIdsOf(row, clientId))
    } catch (e) {
      console.error(e)
      setProblem(p => ({ ...p, [id]: 'That could not be saved. Please try again.' }))
    } finally {
      try { await reloadOne(clientId); await afterAccessChange(id) } catch (e) { console.error(e) }   // always show what really saved
      setBusy(null)
    }
  }

  function choose(row: CompanyRow, clientId: string, key: string) {
    if (busy !== null) return
    const cell = row.cells[clientId]
    if (key === cell.levelKey || key === 'custom') return
    const artist = artists.find(a => a.id === clientId)?.name ?? 'this artist'
    const text = key === NONE
      ? removalWarning({ label: row.person.label, artist, isMe: row.person.memberId === myMemberId, isManager: true, alsoCompanyWide: row.companyWide })
      : levelChangeWarning(cell.levelKey, key, { isMe: row.person.memberId === myMemberId, isManager: true })
    // taking someone off an artist and making a Point Person ask first; everything else saves straight away
    if (key === NONE || text) { setPending({ memberId: row.person.memberId, clientId, key, text: text ?? '' }); return }
    void commit(row, clientId, key)
  }

  async function resend(row: CompanyRow) {
    const id = row.person.memberId
    setBusy(id); setProblem(p => ({ ...p, [id]: '' })); setNotice(n => ({ ...n, [id]: '' }))
    try {
      const res = await fetch('/api/team/invite/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: id }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not send that again')
      setNotice(n => ({ ...n, [id]: resendWording(!!row.person.invited).sent }))
    } catch (e) {
      setProblem(p => ({ ...p, [id]: e instanceof Error ? e.message : 'Could not send that again' }))
    } finally { setBusy(null) }
  }

  /** Gives each of these people the role on one artist, one by one, then re-reads what really saved. */
  async function applyToGroup(rows: CompanyRow[], clientId: string, key: string) {
    let done = 0, failed = 0
    for (const row of rows) {
      try {
        if (key === NONE) await revokeArtistAccess(row.person.memberId, clientId)
        else await applyGrantPlan(row.person.memberId, clientId, planChanges(row.cells[clientId].grants, clientId, presetByKey(key)?.levels ?? {}, key === ADMIN_KEY), adminIdsOf(row, clientId))
        done++
      } catch (e) { console.error(e); failed++ }
    }
    try { await reloadOne(clientId); await afterAccessChange() } catch (e) { console.error(e) }
    return { done, failed }
  }

  async function commitAdmin() {
    if (!adminPending) return
    const { memberId, admin } = adminPending
    setBusy(memberId); setAdminProblem(''); setAdminPending(null)
    try {
      await setCompanyAdmin(memberId, admin)
      // an admin sees everything, so they leave any groups (a group is only for people whose access is chosen one by one)
      if (admin) for (const g of groups.filter(x => x.memberIds.includes(memberId))) await setGroupMembers(g.id, g.memberIds, g.memberIds.filter(id => id !== memberId))
    } catch (e) {
      console.error(e)
      setAdminProblem(e instanceof Error && e.message ? e.message : 'That could not be saved. Please try again.')
    } finally {
      try { await afterAccessChange(); await reloadGroups() } catch (e) { console.error(e) }   // always show what really saved
      setBusy(null)
    }
  }

  const pendingRow = pending ? grid.rows.find(r => r.person.memberId === pending.memberId) : undefined
  const loading = grants === null && !loadError

  return (
    <div className="flex-1 overflow-auto p-4 md:p-8">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-64">
            <CompanyName workspaceId={workspaceId} />
            <p className="mt-1 text-sm text-gray-400">
              {grid.rows.length} {grid.rows.length === 1 ? 'person' : 'people'} · {artists.length} {artists.length === 1 ? 'artist' : 'artists'}. Pick what each person can open for each artist.
            </p>
          </div>
          <button onClick={() => setInviteOpen(true)} className="flex-shrink-0 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover">+ Invite someone</button>
        </div>

        {loadError && <p role="alert" className="mb-3 text-xs text-red-600">The access list could not be loaded. Reload the page to try again.</p>}
        {loading && <p className="mb-3 text-sm text-gray-400">Loading…</p>}

        {pending && pendingRow && (
          <div role="alert" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p><strong>{pendingRow.person.label}</strong> · {artists.find(a => a.id === pending.clientId)?.name}: {pending.text || 'Take away all of their access to this artist?'}</p>
            <div className="mt-2 flex gap-2">
              <button disabled={busy !== null} onClick={() => void commit(pendingRow, pending.clientId, pending.key)} className="rounded-lg bg-accent px-2.5 py-1 font-medium text-white hover:bg-accent-hover disabled:opacity-50">
                {pending.key === NONE ? 'Remove' : pending.key === ADMIN_KEY ? 'Make Point Person' : 'Continue'}
              </button>
              <button onClick={() => setPending(null)} className="rounded-lg border border-amber-200 px-2.5 py-1 font-medium hover:bg-amber-100">Keep</button>
            </div>
          </div>
        )}

        {adminPending && (
          <div role="alert" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p>
              {adminPending.admin
                ? `${adminPending.label} will be able to see and change everything for every artist, including money and private details, and can invite and remove people. Only you, the owner, can make or take back admins.`
                : `${adminPending.label} stops being an admin. They keep their login but can only open what you give them for each artist, which is nothing until you choose roles.`}
            </p>
            <div className="mt-2 flex gap-2">
              <button disabled={busy !== null} onClick={() => void commitAdmin()} className="rounded-lg bg-accent px-2.5 py-1 font-medium text-white hover:bg-accent-hover disabled:opacity-50">{adminPending.admin ? 'Make admin' : 'Take back admin'}</button>
              <button onClick={() => setAdminPending(null)} className="rounded-lg border border-amber-200 px-2.5 py-1 font-medium hover:bg-amber-100">Keep as is</button>
            </div>
          </div>
        )}
        {adminProblem && <p role="alert" className="mb-3 text-xs text-red-600">{adminProblem}</p>}

        <section aria-label="Admins" className="mb-6">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Admins</div>
          <div className="flex flex-col gap-1.5">
            {grid.admins.map(a => (
              <div key={a.memberId} className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 px-4 py-2.5 text-sm">
                <span className="font-medium">{a.label}</span>
                {a.memberId === myMemberId && <span className="text-[11px] text-gray-400">(you)</span>}
                {a.userId === ownerId && <Badge variant="blue">Owner</Badge>}
                <span className="text-xs text-gray-500">{a.userId === ownerId ? 'Owns the company and can open every artist.' : 'Runs the company and can open every artist.'}</span>
                {isOwner && a.userId !== ownerId && (
                  <button onClick={() => setAdminPending({ memberId: a.memberId, admin: false, label: a.label })} disabled={busy !== null} className="ml-auto text-xs font-medium text-red-600 hover:underline disabled:opacity-50">Take back admin</button>
                )}
              </div>
            ))}
          </div>
        </section>

        <GroupsPanel workspaceId={workspaceId} groups={groups} grid={grid} artists={artists.map(a => ({ id: a.id, name: a.name }))} onChanged={reloadGroups} applyToGroup={applyToGroup} />

        <section aria-label="People">
          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">People</div>
          {grid.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">Nobody on your team yet. Use &ldquo;Invite someone&rdquo; to add the first person.</p>
          ) : artists.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">Add an artist first, then choose who can open them.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60 text-left">
                    <th scope="col" className="sticky left-0 z-10 bg-gray-50 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Person</th>
                    {artists.map(a => (
                      <th key={a.id} scope="col" className="min-w-[170px] px-2 py-2 text-left">
                        <button onClick={() => { openClient(a.id); setSection('team') }} title={`Open ${a.name}'s Team page`} className="max-w-[160px] truncate text-xs font-semibold text-gray-700 hover:text-accent hover:underline">{a.name}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.map(row => {
                    const id = row.person.memberId
                    return (
                      <tr key={id} className="border-b border-gray-100 align-top last:border-b-0">
                        <th scope="row" className="sticky left-0 z-10 bg-canvas px-4 py-3 text-left font-normal">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{row.person.label}</span>
                            {row.person.invited && <Badge variant="amber">Invited</Badge>}
                          </div>
                          {groupNamesOf(groups, id).length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-1">{groupNamesOf(groups, id).map(n => <span key={n} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{n}</span>)}</div>
                          )}
                          {row.companyWide && <div className="text-[11px] text-amber-700">Also has every artist (set by a manager)</div>}
                          {!row.person.invited && hasNothing(row) && <div className="text-[11px] text-amber-700">Has a login, can&apos;t open any artist yet</div>}
                          <button onClick={() => void resend(row)} disabled={busy !== null || id === myMemberId} className="mt-1 text-[11px] font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50">
                            {resendWording(!!row.person.invited).button}
                          </button>
                          {isOwner && (
                            <button
                              onClick={() => setAdminPending({ memberId: id, admin: true, label: row.person.label })} disabled={busy !== null || !!row.person.invited}
                              title={row.person.invited ? 'They need to sign in once before they can be made an admin' : undefined}
                              className="mt-1 block text-[11px] font-medium text-gray-500 hover:text-gray-900 disabled:opacity-50"
                            >
                              Make admin
                            </button>
                          )}
                          {notice[id] && <p role="status" className="mt-1 max-w-[220px] text-[11px] text-green-700">{notice[id]}</p>}
                          {problem[id] && <p role="alert" className="mt-1 max-w-[220px] text-[11px] text-red-600">{problem[id]}</p>}
                        </th>
                        {artists.map(a => {
                          const cell = row.cells[a.id]
                          const working = busy === keyOf(id, a.id)
                          return (
                            <td key={a.id} className="px-2 py-3">
                              {loading ? <div aria-hidden="true" className="h-[30px] animate-pulse rounded-lg bg-gray-100" /> : <select
                                aria-label={`${row.person.label} for ${a.name}`} value={cell.levelKey} disabled={busy !== null}
                                onChange={e => choose(row, a.id, e.target.value)}
                                className={`w-full rounded-lg border px-1.5 py-1.5 text-xs focus:border-accent focus:outline-none disabled:opacity-60 ${cell.levelKey === NONE ? 'border-gray-100 text-gray-400' : cell.levelKey === ADMIN_KEY ? 'border-accent/40 bg-accent-soft text-gray-900' : 'border-gray-200 bg-blue-50/50 text-gray-900'}`}
                              >
                                <option value={NONE}>No access</option>
                                {LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                                {cell.levelKey === 'custom' && <option value="custom" disabled>Custom pages</option>}
                              </select>}
                              {working && <div className="mt-0.5 text-[10px] text-gray-400">Saving…</div>}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] text-gray-500">
            &ldquo;Custom pages&rdquo; means someone was given a mix of pages. Open the artist&apos;s Team page (click the artist&apos;s name) to fine-tune a person&apos;s pages.
          </p>
        </section>
      </div>

      {inviteOpen && (
        <Modal wide title="Invite someone to your company" onClose={() => setInviteOpen(false)} footer={<button onClick={() => setInviteOpen(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>}>
          <p className="text-sm text-gray-600">Choose their role and which artists they can open. When they accept, it is already set up.</p>
          <InviteForm onSent={() => void afterAccessChange()} />
        </Modal>
      )}
    </div>
  )
}

/** The company's name, with a Rename button (a manager only; the database enforces it). */
function CompanyName({ workspaceId }: { workspaceId: string | null }) {
  const name = useStore(s => s.companyName)
  const setCompanyName = useStore(s => s.setCompanyName)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    const next = draft.trim()
    if (!workspaceId || !next || busy) return
    setBusy(true); setProblem('')
    try { await renameCompany(workspaceId, next); setCompanyName(next); setEditing(false) }
    catch (e) { console.error(e); setProblem('That could not be saved. Names are 1 to 80 characters.') }
    finally { setBusy(false) }
  }

  if (editing) {
    return (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputClass} max-w-xs`} value={draft} maxLength={80} autoFocus aria-label="Company name"
            onChange={e => setDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setEditing(false) }}
          />
          <button onClick={() => void save()} disabled={busy || !draft.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Save</button>
          <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
        </div>
        {problem && <p role="alert" className="mt-1 text-xs text-red-600">{problem}</p>}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-baseline gap-3">
      <h1 className="font-serif text-2xl font-medium">{name || 'Your company'}</h1>
      <button onClick={() => { setDraft(name); setEditing(true) }} className="text-xs font-medium text-gray-500 hover:text-gray-900">Rename</button>
    </div>
  )
}
