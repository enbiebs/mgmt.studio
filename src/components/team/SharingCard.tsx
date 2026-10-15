'use client'
// ──────────────────────────────────────────────────────────
//  Sharing (the Sharing tab of the Team page): who can open ONE artist and what they can do, laid out like "Share with
//  specific people" in Google Calendar. Managers and this artist's Point People can change it; the database enforces
//  that (migrations 050 and 051), this screen just doesn't offer what would be refused.
// ──────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { selectClass } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ADMIN_KEY, LEVELS, SECTIONS, levelsOf, otherAccess, planChanges, presetByKey, type Level, type SectionKey } from '@/lib/access-presets'
import {
  POINT_PERSON_WARNING, addablePeople, buildSharingRows, describeRow, levelChangeWarning, levelLabel, pointPeopleCount, removalWarning,
  type SharingGrant, type SharingRow,
} from '@/lib/sharing'
import { applyGrantPlan, fetchArtistGrants, revokeArtistAccess } from '@/lib/db'
import type { Client } from '@/types'
import { Card } from '@/components/profile/FieldsCard'

type PersonRow = Extract<SharingRow, { kind: 'person' }>
type Confirm = { memberId: string; kind: 'level'; key: string; text: string } | { memberId: string; kind: 'remove'; text: string }

const NEXT_LEVEL: Record<Level, Level> = { none: 'view', view: 'edit', edit: 'none' }
const LEVEL_WORDS: Record<Level, string> = { none: 'no access', view: 'can look', edit: 'can change' }

export function SharingCard({ client }: { client: Client }) {
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
  const [addId, setAddId] = useState('')
  const [addKey, setAddKey] = useState('')
  const [addConfirm, setAddConfirm] = useState(false)
  const [addProblem, setAddProblem] = useState('')

  const reload = useCallback(async () => {
    try { setGrants(await fetchArtistGrants(client.id)); setLoadError(false) } catch (e) { console.error(e); setLoadError(true) }
  }, [client.id])
  useEffect(() => {
    let live = true
    fetchArtistGrants(client.id)
      .then(g => { if (live) { setGrants(g); setLoadError(false) } })
      .catch(e => { console.error(e); if (live) setLoadError(true) })
    // the team list was read when the app opened; someone may have joined since
    void afterAccessChange()
    return () => { live = false }
  }, [client.id, afterAccessChange])

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
      setProblem(p => ({ ...p, [id]: 'That could not be saved. Please try again.' }))
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

  function togglePage(row: PersonRow, section: SectionKey) {
    if (busy !== null) return
    const levels = levelsOf(row.grants, client.id)
    const next = NEXT_LEVEL[levels[section] ?? 'none']
    void run(row, () => applyGrantPlan(row.person.memberId, client.id, planChanges(row.grants, client.id, { ...levels, [section]: next }), adminIds(row)))
  }

  async function addPerson() {
    const person = addable.find(p => p.memberId === addId)
    const preset = presetByKey(addKey)
    if (!person || !preset || busy !== null) return
    if (addKey === ADMIN_KEY && !addConfirm) { setAddConfirm(true); return }
    setBusy('add'); setAddProblem(''); setConfirm(null)
    try {
      await applyGrantPlan(person.memberId, client.id, planChanges([], client.id, preset.levels, addKey === ADMIN_KEY))
      setAddId(''); setAddKey(''); setAddConfirm(false)
    } catch (e) {
      console.error(e)
      setAddProblem('That could not be saved. Please try again.')
    } finally {
      try { await reload(); await afterAccessChange(person.memberId) } catch (e) { console.error(e) }
      setBusy(null)
    }
  }

  const addPreset = presetByKey(addKey)
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
              No Point Person yet. Pick someone below and choose Point Person, so this artist has an admin besides you.
            </p>
          )}

          <ul className="space-y-2">
            {rows.map(row => {
              const id = row.person.memberId
              const me = id === myMemberId
              const pending = confirm?.memberId === id ? confirm : null
              const extras = isManager && row.kind === 'person' ? otherAccess(row.grants, client.id) : []
              return (
                <li key={id} className="rounded-xl border border-gray-100 p-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="min-w-0 flex-1 basis-48">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{row.person.label}</span>
                        {me && <span className="text-[11px] text-gray-400">(you)</span>}
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
                      <select
                        aria-label={`Level for ${row.person.label}`} aria-busy={working}
                        value={row.levelKey === 'none' ? '' : row.levelKey}
                        onChange={e => chooseLevel(row, e.target.value)}
                        className={`${selectClass} w-auto max-w-[260px]`}
                      >
                        {row.levelKey === 'none' && <option value="" disabled>{levelLabel('none')}</option>}
                        {row.levelKey === 'custom' && <option value="custom" disabled>{levelLabel('custom')}</option>}
                        {LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                      </select>
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
                      {canPreview(id) && (
                        <button onClick={() => void previewAs(id)} aria-label={`Preview what ${row.person.label} sees`} className="font-medium text-gray-500 hover:text-gray-900">
                          Preview what they see
                        </button>
                      )}
                      <button onClick={() => askRemove(row)} disabled={working} aria-label={`Remove ${row.person.label} from ${client.name}`} className="font-medium text-red-600 hover:underline disabled:opacity-50">
                        Remove
                      </button>
                      {busy === id && <span className="text-gray-400">Saving…</span>}
                    </div>
                  )}

                  {row.kind === 'person' && openPages === id && row.levelKey !== ADMIN_KEY && (
                    <div className="mt-2">
                      <div className="mb-1 text-[11px] text-gray-500">Click a page once to let them look, again to let them change it, again to take it away. Taking away their last page removes them from this list.</div>
                      <div className="flex flex-wrap gap-1">
                        {SECTIONS.map(sec => {
                          const level = levelsOf(row.grants, client.id)[sec.key] ?? 'none'
                          const cls = level === 'edit' ? 'bg-accent text-white' : level === 'view' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                          return (
                            <button
                              key={sec.key} type="button" disabled={working} onClick={() => togglePage(row, sec.key)}
                              aria-label={`${sec.label}: ${LEVEL_WORDS[level]}`} aria-pressed={level !== 'none'}
                              className={`rounded-full px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50 ${cls}`}
                            >
                              {sec.label}{level === 'edit' ? ' ✎' : ''}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {row.kind === 'person' && pending && (
                    <div role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      <p>{pending.text}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          disabled={working}
                          onClick={() => pending.kind === 'level' ? void commitLevel(row, pending.key) : void commitRemove(row)}
                          className="rounded-lg bg-accent px-2.5 py-1 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                        >
                          {pending.kind === 'remove' ? 'Remove' : pending.key === ADMIN_KEY ? 'Make Point Person' : 'Continue'}
                        </button>
                        <button disabled={working} onClick={() => setConfirm(null)} className="rounded-lg border border-amber-200 px-2.5 py-1 font-medium hover:bg-amber-100 disabled:opacity-50">Cancel</button>
                      </div>
                    </div>
                  )}
                  {problem[id] && <p role="alert" className="mt-2 text-xs text-red-600">{problem[id]}</p>}
                </li>
              )
            })}
          </ul>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-500">Add someone</div>
            {addable.length === 0 ? (
              <p className="text-xs text-gray-500">
                {people.some(p => p.role !== 'manager' && p.role !== 'artist')
                  ? `Everyone on the team can already open ${client.name}.`
                  : 'Nobody else is on your team yet.'}
                {' '}To add someone new, add them under People first, then a manager invites them to log in from their card. Point People will be able to invite people directly in a later update.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <select aria-label="Teammate to add" value={addId} onChange={e => { setAddId(e.target.value); setAddConfirm(false) }} className={`${selectClass} w-auto min-w-[170px] flex-1`}>
                    <option value="">Choose a teammate…</option>
                    {addable.map(p => <option key={p.memberId} value={p.memberId}>{p.label}</option>)}
                  </select>
                  <select aria-label="Role for the new person" value={addKey} onChange={e => { setAddKey(e.target.value); setAddConfirm(false) }} className={`${selectClass} w-auto min-w-[170px] flex-1`}>
                    <option value="">Choose a role…</option>
                    {LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                  </select>
                  <button
                    onClick={() => void addPerson()} disabled={!addId || !addKey || working}
                    className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {busy === 'add' ? 'Adding…' : addConfirm ? 'Yes, add as Point Person' : 'Add'}
                  </button>
                </div>
                {addPreset && (
                  <p className="mt-2 text-xs text-gray-500">
                    {addPreset.blurb}
                    {addPreset.key !== ADMIN_KEY && addPreset.hidden !== 'Nothing' ? ` Can't see: ${addPreset.hidden}.` : ''}
                    {addPreset.key === ADMIN_KEY ? ' Not the vault.' : ' You can fine-tune the pages after adding.'}
                  </p>
                )}
                {addConfirm && <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{POINT_PERSON_WARNING}</p>}
                {addProblem && <p role="alert" className="mt-2 text-xs text-red-600">{addProblem}</p>}
              </>
            )}
          </div>
        </>
      )}
    </Card>
  )
}
