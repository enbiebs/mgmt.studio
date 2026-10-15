'use client'
// ──────────────────────────────────────────────────────────
//  Sharing (the Sharing tab of the Team page): who can open ONE artist and what they can do, laid out like "Share with
//  specific people" in Google Calendar. Managers and this artist's Point People can change it; the database enforces
//  that (migrations 050 and 051), this screen just doesn't offer what would be refused. Inviting someone brand new is
//  managers only (the invite route enforces it) and carries the role, level, pages and artists chosen up front.
// ──────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { selectClass } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import {
  ADMIN_KEY, cyclePage, levelsForRole, levelsOf, otherAccess, planChanges, presetByKey, setAllPages,
  type PageLevels, type SectionKey,
} from '@/lib/access-presets'
import {
  POINT_PERSON_WARNING, addablePeople, buildSharingRows, describeRow, levelChangeWarning, levelLabel, pointPeopleCount, removalWarning,
  type SharingGrant, type SharingRow,
} from '@/lib/sharing'
import { applyGrantPlan, fetchArtistGrants, revokeArtistAccess } from '@/lib/db'
import type { Client } from '@/types'
import { Card } from '@/components/profile/FieldsCard'
import { RoleMenu } from './RoleMenu'
import { PagesPanel } from './PagesPanel'

type PersonRow = Extract<SharingRow, { kind: 'person' }>
type Confirm =
  | { memberId: string; kind: 'level'; key: string; text: string }
  | { memberId: string; kind: 'remove'; text: string }
  | { memberId: string; kind: 'cancel'; text: string }

export function SharingCard({ client, onAddMember }: { client: Client; onAddMember: () => void }) {
  const role = useStore(s => s.role)
  const myMemberId = useStore(s => s.myMemberId)
  const people = useStore(s => s.workspacePeople)
  const previewMembers = useStore(s => s.previewMembers)
  const previewAs = useStore(s => s.previewAs)
  const refreshMyAccess = useStore(s => s.refreshMyAccess)
  const afterAccessChange = useStore(s => s.afterAccessChange)
  const iAmPointPerson = useStore(s => s.grants.some(g => g.section === ADMIN_KEY && g.clientId === client.id))
  const isManager = role === 'manager'

  const [grants, setGrants] = useState<SharingGrant[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [openPages, setOpenPages] = useState<string | null>(null)
  const [mode, setMode] = useState<'new' | 'existing'>('new')
  const [addId, setAddId] = useState('')
  const [addKey, setAddKey] = useState('')
  const [addLevels, setAddLevels] = useState<PageLevels>({})
  const [addPoint, setAddPoint] = useState(false)
  const [addConfirm, setAddConfirm] = useState(false)
  const [addProblem, setAddProblem] = useState('')

  const reload = useCallback(async () => {
    try { setGrants(await fetchArtistGrants(client.id)); setLoadError(false) } catch (e) { console.error(e); setLoadError(true) }
  }, [client.id])
  // The list is read again whenever the team list changes (someone was just invited, or a change was saved).
  useEffect(() => {
    let live = true
    fetchArtistGrants(client.id)
      .then(g => { if (live) { setGrants(g); setLoadError(false) } })
      .catch(e => { console.error(e); if (live) setLoadError(true) })
    return () => { live = false }
  }, [client.id, people])
  // the team list was read when the app opened; someone may have joined since
  useEffect(() => { void afterAccessChange() }, [client.id, afterAccessChange])

  const rows = useMemo(() => buildSharingRows(people, grants ?? [], client.id), [people, grants, client.id])
  const addable = useMemo(() => addablePeople(people, rows), [people, rows])
  const canPreview = (memberId: string) => isManager && previewMembers.some(m => m.id === memberId)

  if (!isManager && !iAmPointPerson) return null

  const adminIds = (row: PersonRow) => row.grants.filter(g => g.section === ADMIN_KEY).map(g => g.id)

  /** Runs one change for one person, then re-reads what really saved (also when it was refused) and refreshes what depends on it. */
  async function run(row: PersonRow, task: () => Promise<void>) {
    const id = row.person.memberId
    setBusy(id); setConfirm(null)
    setProblem(p => ({ ...p, [id]: '' }))
    try {
      await task()
    } catch (e) {
      console.error(e)
      setProblem(p => ({ ...p, [id]: e instanceof Error && e.message && !/not allowed|could not be/i.test(e.message) ? e.message : 'That could not be saved. Please try again.' }))
    } finally {
      try {
        await reload()
        await afterAccessChange(id)
        if (id === myMemberId) {
          await refreshMyAccess()
          // someone who just removed their own access should not be left looking at the artist
          const s = useStore.getState()
          const open = s.accessibleClientIds()
          if (open !== 'all' && !open.includes(client.id)) s.goToDashboard()
        }
      } catch (e) { console.error(e) }
      setBusy(null)
    }
  }

  function chooseLevel(row: PersonRow, key: string) {
    if (busy !== null || key === row.levelKey || key === 'custom') return
    const warning = levelChangeWarning(row.levelKey, key, { isMe: row.person.memberId === myMemberId, isManager })
    if (warning) { setConfirm({ memberId: row.person.memberId, kind: 'level', key, text: warning }); return }
    void commitLevel(row, key)
  }
  const commitLevel = (row: PersonRow, key: string) =>
    run(row, () => applyGrantPlan(row.person.memberId, client.id, planChanges(row.grants, client.id, presetByKey(key)?.levels ?? {}, key === ADMIN_KEY), adminIds(row)))

  function askRemove(row: PersonRow) {
    setConfirm({
      memberId: row.person.memberId, kind: 'remove',
      text: removalWarning({ label: row.person.label, artist: client.name, isMe: row.person.memberId === myMemberId, isManager, alsoCompanyWide: row.alsoCompanyWide }),
    })
  }
  const commitRemove = (row: PersonRow) => run(row, () => revokeArtistAccess(row.person.memberId, client.id))

  function askCancel(row: PersonRow) {
    setConfirm({ memberId: row.person.memberId, kind: 'cancel', text: `Cancel the invitation to ${row.person.label}? Their login and the access set up for them are deleted. Nothing else changes.` })
  }
  const commitCancel = (row: PersonRow) => run(row, async () => {
    const res = await fetch('/api/team/invite/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: row.person.memberId }) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error ?? 'Could not cancel that invitation')
  })

  function changePages(row: PersonRow, next: PageLevels) {
    if (busy !== null) return
    void run(row, () => applyGrantPlan(row.person.memberId, client.id, planChanges(row.grants, client.id, next), adminIds(row)))
  }

  // ── adding someone who is already on the team ──
  function chooseAddRole(key: string) {
    setAddKey(key); setAddConfirm(false); setAddProblem('')
    setAddPoint(key === ADMIN_KEY); setAddLevels(key === ADMIN_KEY ? {} : levelsForRole(key))
  }
  async function addPerson() {
    const person = addable.find(p => p.memberId === addId)
    if (!person || addKey === '' || busy !== null) return
    if (addPoint && !addConfirm) { setAddConfirm(true); return }
    setBusy('add'); setAddProblem(''); setConfirm(null)
    try {
      await applyGrantPlan(person.memberId, client.id, planChanges([], client.id, addLevels, addPoint))
      setAddId(''); setAddKey(''); setAddLevels({}); setAddPoint(false); setAddConfirm(false)
    } catch (e) {
      console.error(e)
      setAddProblem('That could not be saved. Please try again.')
    } finally {
      try { await reload(); await afterAccessChange(person.memberId) } catch (e) { console.error(e) }
      setBusy(null)
    }
  }
  const addHasPages = addPoint || Object.keys(addLevels).length > 0

  const working = busy !== null

  return (
    <Card
      title="Sharing"
      hint={`Who can open ${client.name}, and what they can do. Managers see everything. A Point Person runs this artist's whole business and can add and remove people here.`}
    >
      {loadError && <p role="alert" className="mb-3 text-xs text-red-600">The list could not be loaded. <button onClick={() => void reload()} className="font-medium underline">Try again</button></p>}
      {!loadError && grants === null && <p className="text-sm text-gray-400">Loading…</p>}
      <div role="status" aria-live="polite" className="sr-only">{working ? 'Saving…' : ''}</div>

      {grants !== null && (
        <>
          {isManager && pointPeopleCount(rows) === 0 && (
            <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No Point Person yet. Add someone below as a Point Person, so this artist has an admin besides you.
            </p>
          )}

          <ul className="space-y-2">
            {rows.map(row => {
              const id = row.person.memberId
              const me = id === myMemberId
              const pending = confirm?.memberId === id ? confirm : null
              const extras = isManager && row.kind === 'person' ? otherAccess(row.grants, client.id) : []
              const waiting = row.kind === 'person' && !!row.person.invited
              return (
                <li key={id} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1 basis-48">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-semibold">{row.person.label}</span>
                        {me && <span className="text-[11px] text-gray-400">(you)</span>}
                        {waiting && <Badge variant="amber">Invited, waiting to accept</Badge>}
                      </div>
                      <div className="text-xs text-gray-500">
                        {row.kind === 'manager' && 'Manager: sees and changes everything, for every artist.'}
                        {row.kind === 'company' && (isManager
                          ? 'Can open every artist. Change that from their card under People.'
                          : 'Can open every artist. Only a manager can change that.')}
                        {row.kind === 'person' && describeRow(row, client.id)}
                      </div>
                      {row.kind === 'person' && row.alsoCompanyWide && <div className="text-[11px] text-amber-700">Also has company-wide access, set by a manager.</div>}
                      {extras.length > 0 && <div className="text-[11px] text-amber-700">Also has: {extras.join(', ')}.</div>}
                    </div>

                    {row.kind === 'person' ? (
                      <div className="w-full sm:w-72 sm:flex-none">
                        <RoleMenu
                          ariaLabel={`Role for ${row.person.label}`} busy={working}
                          value={row.levelKey} shownAs={row.levelKey === 'none' || row.levelKey === 'custom' ? levelLabel(row.levelKey) : undefined}
                          onChange={key => chooseLevel(row, key)}
                        />
                      </div>
                    ) : (
                      <Badge variant="gray">{row.kind === 'manager' ? 'Manager' : 'All artists'}</Badge>
                    )}
                  </div>

                  {row.kind === 'person' && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                      {row.levelKey !== ADMIN_KEY && (
                        <button
                          onClick={() => setOpenPages(openPages === id ? null : id)} aria-expanded={openPages === id}
                          aria-label={`${openPages === id ? 'Hide' : 'Choose'} pages for ${row.person.label}`}
                          className="font-medium text-gray-500 hover:text-gray-900"
                        >
                          {openPages === id ? 'Hide pages' : 'Choose pages'}
                        </button>
                      )}
                      {canPreview(id) && !waiting && (
                        <button onClick={() => void previewAs(id)} aria-label={`Preview what ${row.person.label} sees`} className="font-medium text-gray-500 hover:text-gray-900">
                          Preview what they see
                        </button>
                      )}
                      {waiting && isManager ? (
                        <button onClick={() => askCancel(row)} disabled={working} aria-label={`Cancel the invitation to ${row.person.label}`} className="font-medium text-red-600 hover:underline disabled:opacity-50">
                          Cancel invite
                        </button>
                      ) : (
                        <button onClick={() => askRemove(row)} disabled={working} aria-label={`Remove ${row.person.label} from ${client.name}`} className="font-medium text-red-600 hover:underline disabled:opacity-50">
                          Remove
                        </button>
                      )}
                      {busy === id && <span className="text-gray-400">Saving…</span>}
                    </div>
                  )}

                  {row.kind === 'person' && openPages === id && row.levelKey !== ADMIN_KEY && (
                    <div className="mt-3">
                      <PagesPanel
                        levels={levelsOf(row.grants, client.id)} pointPerson={false} disabled={working}
                        onCycle={(s: SectionKey) => changePages(row, cyclePage(levelsOf(row.grants, client.id), s))}
                        onSetAll={level => changePages(row, setAllPages(levelsOf(row.grants, client.id), level))}
                        onPointPerson={() => chooseLevel(row, ADMIN_KEY)}
                      />
                      <p className="mt-1 text-[11px] text-gray-500">Taking away their last page removes them from this list.</p>
                    </div>
                  )}

                  {row.kind === 'person' && pending && (
                    <div role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <p>{pending.text}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          disabled={working}
                          onClick={() => pending.kind === 'level' ? void commitLevel(row, pending.key) : pending.kind === 'cancel' ? void commitCancel(row) : void commitRemove(row)}
                          className="rounded-lg bg-accent px-2.5 py-1 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                        >
                          {pending.kind === 'remove' ? 'Remove' : pending.kind === 'cancel' ? 'Cancel invite' : pending.key === ADMIN_KEY ? 'Make Point Person' : 'Continue'}
                        </button>
                        <button disabled={working} onClick={() => setConfirm(null)} className="rounded-lg border border-amber-200 px-2.5 py-1 font-medium hover:bg-amber-100 disabled:opacity-50">Keep</button>
                      </div>
                    </div>
                  )}
                  {problem[id] && <p role="alert" className="mt-2 text-xs text-red-600">{problem[id]}</p>}
                </li>
              )
            })}
          </ul>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Add someone</div>
              <div role="group" aria-label="Who to add" className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-xs font-medium">
                <button type="button" aria-pressed={mode === 'new'} onClick={() => setMode('new')} className={`px-3 py-1.5 ${mode === 'new' ? 'bg-accent text-white' : 'bg-canvas text-gray-600 hover:bg-gray-50'}`}>New team member</button>
                <button type="button" aria-pressed={mode === 'existing'} onClick={() => setMode('existing')} className={`border-l border-gray-200 px-3 py-1.5 ${mode === 'existing' ? 'bg-accent text-white' : 'bg-canvas text-gray-600 hover:bg-gray-50'}`}>Already on the team</button>
              </div>
            </div>

            {mode === 'new' && (
              isManager ? (
                <div>
                  <p className="mb-3 text-xs text-gray-500">
                    Add them to the team first, then choose what they can see and send the invite. It is one step after the other, so nothing is set up twice.
                  </p>
                  <button onClick={onAddMember} className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover">Add a team member</button>
                </div>
              ) : <p className="text-xs text-gray-500">Only a manager can invite someone new for now. If they already have a login, add them under &ldquo;Already on the team&rdquo;.</p>
            )}

            {mode === 'existing' && (
              addable.length === 0 ? (
                <p className="text-xs text-gray-500">
                  {people.some(p => p.role !== 'manager' && p.role !== 'artist')
                    ? `Everyone on the team can already open ${client.name}.`
                    : 'Nobody else is on your team yet.'}
                  {' '}To bring in someone new, choose &ldquo;New team member&rdquo;.
                </p>
              ) : (
                <div className="space-y-3">
                  <select aria-label="Teammate to add" value={addId} onChange={e => { setAddId(e.target.value); setAddConfirm(false) }} className={`${selectClass} w-auto min-w-[200px]`}>
                    <option value="">Choose a teammate…</option>
                    {addable.map(p => <option key={p.memberId} value={p.memberId}>{p.label}</option>)}
                  </select>
                  <RoleMenu ariaLabel="Role for the person you are adding" value={addKey} onChange={chooseAddRole} />
                  {addKey !== '' && (
                    <PagesPanel
                      levels={addLevels} pointPerson={addPoint} disabled={working}
                      onCycle={(s: SectionKey) => { setAddLevels(l => cyclePage(l, s)); setAddConfirm(false) }}
                      onSetAll={level => { setAddPoint(false); setAddLevels(l => setAllPages(Object.keys(l).length ? l : levelsForRole(addKey === ADMIN_KEY ? 'assistant' : addKey), level)); setAddConfirm(false) }}
                      onPointPerson={() => { setAddPoint(true); setAddLevels({}); setAddKey(ADMIN_KEY); setAddConfirm(false) }}
                    />
                  )}
                  {addConfirm && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{POINT_PERSON_WARNING}</p>}
                  {addProblem && <p role="alert" className="text-xs text-red-600">{addProblem}</p>}
                  <button
                    onClick={() => void addPerson()} disabled={!addId || addKey === '' || !addHasPages || working}
                    className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {busy === 'add' ? 'Adding…' : addConfirm ? 'Yes, add as Point Person' : 'Add'}
                  </button>
                </div>
              )
            )}
          </div>
        </>
      )}
    </Card>
  )
}
