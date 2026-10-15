'use client'
// ──────────────────────────────────────────────────────────
//  Sharing (the Sharing tab of the Team page): who can open ONE artist and what they can do, laid out like "Share with
//  specific people" in Google Calendar. Managers and this artist's Point People can change it; the database enforces
//  that (migration 050), this screen just doesn't offer what would be refused.
// ──────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { selectClass } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { ADMIN_KEY, LEVELS, SECTIONS, levelsOf, planChanges, presetByKey, type Level, type SectionKey } from '@/lib/access-presets'
import { addablePeople, buildSharingRows, describeRow, levelLabel, pointPeopleCount, type SharingGrant, type SharingRow } from '@/lib/sharing'
import { applyGrantPlan, fetchArtistGrants } from '@/lib/db'
import type { Client } from '@/types'
import { Card } from '@/components/profile/FieldsCard'

type PersonRow = Extract<SharingRow, { kind: 'person' }>
type Confirm = { memberId: string; kind: 'level'; key: string; text: string } | { memberId: string; kind: 'remove'; text: string }

const POINT_PERSON_WARNING = 'A Point Person can see and change everything for this artist, including money, contracts and private details, and can decide who else has access.'
const NEXT_LEVEL: Record<Level, Level> = { none: 'view', view: 'edit', edit: 'none' }

export function SharingCard({ client }: { client: Client }) {
  const role = useStore(s => s.role)
  const myMemberId = useStore(s => s.myMemberId)
  const people = useStore(s => s.workspacePeople)
  const previewMembers = useStore(s => s.previewMembers)
  const previewAs = useStore(s => s.previewAs)
  const refreshMyAccess = useStore(s => s.refreshMyAccess)
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
    return () => { live = false }
  }, [client.id])

  const rows = useMemo(() => buildSharingRows(people, grants ?? [], client.id), [people, grants, client.id])
  const addable = useMemo(() => addablePeople(people, rows), [people, rows])
  const canPreview = (memberId: string) => isManager && previewMembers.some(m => m.id === memberId)

  if (!isManager && !iAmPointPerson) return null

  /** Runs a change for one person, then re-reads what really saved (also when it was refused). */
  async function run(row: PersonRow, plan: ReturnType<typeof planChanges>, removingEveryone = false) {
    const mine = row.person.memberId === myMemberId
    setBusy(row.person.memberId); setConfirm(null)
    setProblem(p => ({ ...p, [row.person.memberId]: '' }))
    try {
      const lastIds = row.grants.filter(g => g.section === ADMIN_KEY).map(g => g.id)
      // Removing someone altogether: a manager also takes away their vault access for this artist (a Point Person cannot see those rows).
      if (isManager && removingEveryone) plan.remove.push(...row.grants.filter(g => g.section === 'vault').map(g => g.id))
      await applyGrantPlan(row.person.memberId, client.id, plan, lastIds)
    } catch (e) {
      console.error(e)
      setProblem(p => ({ ...p, [row.person.memberId]: 'That could not be saved. Please try again.' }))
    }
    await reload()
    if (mine) await refreshMyAccess()
    setBusy(null)
  }

  function warningFor(row: PersonRow, key: string): string | null {
    const mine = row.person.memberId === myMemberId
    if (key === ADMIN_KEY && row.levelKey !== ADMIN_KEY) return POINT_PERSON_WARNING
    if (row.levelKey === ADMIN_KEY && key !== ADMIN_KEY && mine && !isManager) return 'You are a Point Person for this artist. If you step down you can no longer manage who has access.'
    if (row.levelKey === 'custom') return 'This replaces the pages you picked for them.'
    return null
  }

  function chooseLevel(row: PersonRow, key: string) {
    if (key === row.levelKey || key === 'custom') return
    const warning = warningFor(row, key)
    if (warning) { setConfirm({ memberId: row.person.memberId, kind: 'level', key, text: warning }); return }
    void commitLevel(row, key)
  }
  const commitLevel = (row: PersonRow, key: string) =>
    run(row, planChanges(row.grants, client.id, presetByKey(key)?.levels ?? {}, key === ADMIN_KEY))

  function askRemove(row: PersonRow) {
    const mine = row.person.memberId === myMemberId
    setConfirm({
      memberId: row.person.memberId, kind: 'remove',
      text: mine && !isManager ? 'You will lose all access to this artist, including the ability to manage sharing.' : `${row.person.label} will no longer be able to open ${client.name}.`,
    })
  }
  const commitRemove = (row: PersonRow) => run(row, planChanges(row.grants, client.id, {}, false), true)

  function togglePage(row: PersonRow, section: SectionKey) {
    const levels = levelsOf(row.grants, client.id)
    const next = NEXT_LEVEL[levels[section] ?? 'none']
    void run(row, planChanges(row.grants, client.id, { ...levels, [section]: next }))
  }

  async function addPerson() {
    const person = addable.find(p => p.memberId === addId)
    const preset = presetByKey(addKey)
    if (!person || !preset) return
    if (addKey === ADMIN_KEY && !addConfirm) { setAddConfirm(true); return }
    setBusy('add'); setAddProblem('')
    try {
      await applyGrantPlan(person.memberId, client.id, planChanges([], client.id, preset.levels, addKey === ADMIN_KEY))
      setAddId(''); setAddKey(''); setAddConfirm(false)
    } catch (e) {
      console.error(e)
      setAddProblem('That could not be saved. Please try again.')
    }
    await reload()
    setBusy(null)
  }

  const addPreset = presetByKey(addKey)

  return (
    <Card
      title="Sharing"
      hint={`Who can open ${client.name}, and what they can do. Managers see everything. A Point Person runs this artist's whole business and can add and remove people here.`}
    >
      {loadError && <p role="alert" className="mb-3 text-xs text-red-600">The list could not be loaded. <button onClick={() => void reload()} className="font-medium underline">Try again</button></p>}
      {!loadError && grants === null && <p className="text-sm text-gray-400">Loading…</p>}

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
                        {row.kind === 'company' && 'Can open every artist. Only a manager can change that.'}
                        {row.kind === 'person' && describeRow(row, client.id)}
                      </div>
                      {row.kind === 'person' && row.alsoCompanyWide && <div className="text-[11px] text-amber-700">Also has company-wide access, set by a manager.</div>}
                    </div>

                    {row.kind === 'person' ? (
                      <select
                        aria-label={`Level for ${row.person.label}`} disabled={busy !== null}
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
                        <button onClick={() => setOpenPages(openPages === id ? null : id)} className="font-medium text-gray-500 hover:text-gray-900">
                          {openPages === id ? 'Hide pages' : 'Choose pages'}
                        </button>
                      )}
                      {canPreview(id) && <button onClick={() => void previewAs(id)} className="font-medium text-gray-500 hover:text-gray-900">Preview what they see</button>}
                      <button onClick={() => askRemove(row)} disabled={busy !== null} className="font-medium text-red-600 hover:underline disabled:opacity-50">Remove</button>
                      {busy === id && <span className="text-gray-400">Saving…</span>}
                    </div>
                  )}

                  {row.kind === 'person' && openPages === id && row.levelKey !== ADMIN_KEY && (
                    <div className="mt-2">
                      <div className="mb-1 text-[11px] text-gray-400">Click a page once to let them look, again to let them change it, again to remove it.</div>
                      <div className="flex flex-wrap gap-1">
                        {SECTIONS.map(sec => {
                          const level = levelsOf(row.grants, client.id)[sec.key] ?? 'none'
                          const cls = level === 'edit' ? 'bg-accent text-white' : level === 'view' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                          return (
                            <button
                              key={sec.key} type="button" disabled={busy !== null} onClick={() => togglePage(row, sec.key)}
                              title={level === 'none' ? 'No access' : level === 'view' ? 'Can look' : 'Can change'}
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
                          onClick={() => pending.kind === 'level' ? void commitLevel(row, pending.key) : void commitRemove(row)}
                          className="rounded-lg bg-accent px-2.5 py-1 font-medium text-white hover:bg-accent-hover"
                        >
                          {pending.kind === 'remove' ? 'Remove' : pending.key === ADMIN_KEY ? 'Make Point Person' : 'Continue'}
                        </button>
                        <button onClick={() => setConfirm(null)} className="rounded-lg border border-amber-200 px-2.5 py-1 font-medium hover:bg-amber-100">Cancel</button>
                      </div>
                    </div>
                  )}
                  {problem[id] && <p role="alert" className="mt-2 text-xs text-red-600">{problem[id]}</p>}
                </li>
              )
            })}
          </ul>

          <div className="mt-5 border-t border-gray-100 pt-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Add someone</div>
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
                    onClick={() => void addPerson()} disabled={!addId || !addKey || busy !== null}
                    className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {busy === 'add' ? 'Adding…' : addConfirm ? 'Yes, add as Point Person' : 'Add'}
                  </button>
                </div>
                {addPreset && (
                  <p className="mt-2 text-xs text-gray-500">
                    {addPreset.blurb}{addPreset.key !== ADMIN_KEY && addPreset.hidden !== 'Nothing' ? ` Can't see: ${addPreset.hidden}.` : ''} You can fine-tune the pages after adding.
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
