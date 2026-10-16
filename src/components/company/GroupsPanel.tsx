'use client'
// ──────────────────────────────────────────────────────────
//  Groups: a saved list of people ("Booking team") so a role on one artist can be given to all of them at once. A group
//  only remembers WHO is in it. What each person can open is still their own (the grid above it), so nothing about who can
//  see what ever depends on a group; "Give this group access" simply saves each person's own access, one by one.
// ──────────────────────────────────────────────────────────
import { useState } from 'react'
import { inputClass } from '@/components/ui/Modal'
import { ADMIN_KEY, LEVELS } from '@/lib/access-presets'
import { planGroupApply, type CompanyGrid, type CompanyGroup } from '@/lib/company'
import { POINT_PERSON_WARNING } from '@/lib/sharing'
import { createGroup, deleteGroup, renameGroup, setGroupMembers } from '@/lib/db'

const NONE = 'none'

export function GroupsPanel({ workspaceId, groups, grid, artists, onChanged, applyToGroup }: {
  workspaceId: string | null
  groups: CompanyGroup[]
  grid: CompanyGrid
  artists: { id: string; name: string }[]
  /** Re-read the groups (after any change here). */
  onChanged: () => Promise<void>
  applyToGroup: (rows: CompanyGrid['rows'], clientId: string, key: string) => Promise<{ done: number; failed: number }>
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  const [artistId, setArtistId] = useState('')
  const [roleKey, setRoleKey] = useState('')
  const [confirm, setConfirm] = useState<'apply' | 'delete' | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [result, setResult] = useState('')

  const group = groups.find(g => g.id === openId) ?? null
  const reset = () => { setConfirm(null); setProblem(''); setResult('') }

  async function run<T>(task: () => Promise<T>, failMessage = 'That could not be saved. Please try again.'): Promise<T | undefined> {
    setBusy(true); setProblem('')
    try { return await task() }
    catch (e) { console.error(e); setProblem(e instanceof Error && e.message && !/row-level|permission|violates/i.test(e.message) ? e.message : failMessage); return undefined }
    finally { setBusy(false) }
  }

  async function create() {
    const name = newName.trim()
    if (!name || !workspaceId) return
    const id = await run(async () => { const made = await createGroup(workspaceId, name); await onChanged(); return made })
    if (id) { setOpenId(id); setNewName(''); setAdding(false); reset() }
  }
  async function toggle(memberId: string) {
    if (!group) return
    const after = group.memberIds.includes(memberId) ? group.memberIds.filter(x => x !== memberId) : [...group.memberIds, memberId]
    await run(async () => { await setGroupMembers(group.id, group.memberIds, after); await onChanged() })
    setResult('')
  }
  async function rename() {
    const name = draft.trim()
    if (!group || !name) return
    const ok = await run(async () => { await renameGroup(group.id, name); await onChanged(); return true })
    if (ok) setRenaming(false)
  }
  async function remove() {
    if (!group) return
    const ok = await run(async () => { await deleteGroup(group.id); await onChanged(); return true })
    if (ok) { setOpenId(null); reset() }
  }

  const plan = group && artistId && roleKey ? planGroupApply(group, grid, artistId, roleKey) : null
  const artistName = artists.find(a => a.id === artistId)?.name ?? 'this artist'
  const needsConfirm = roleKey === ADMIN_KEY || roleKey === NONE

  async function apply() {
    if (!group || !plan || plan.change.length === 0) return
    if (needsConfirm && confirm !== 'apply') { setConfirm('apply'); return }
    setConfirm(null)
    const out = await run(() => applyToGroup(plan.change, artistId, roleKey))
    if (out) setResult(out.failed ? `Saved for ${out.done}, but ${out.failed} could not be saved. Check the grid and try again.` : `Done: ${out.done} ${out.done === 1 ? 'person' : 'people'} updated${plan.same.length ? `, ${plan.same.length} already had it` : ''}.`)
  }

  return (
    <section aria-label="Groups" className="mb-6">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Groups</div>
        {!adding && <button onClick={() => { setAdding(true); reset() }} className="text-xs font-medium text-accent hover:underline">+ New group</button>}
      </div>
      <p className="mb-2 text-xs text-gray-500">A group is a saved list of people, like &ldquo;Booking team&rdquo;. Use it to give everyone in it the same role on an artist in one step.</p>

      {adding && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input className={`${inputClass} max-w-xs`} value={newName} maxLength={60} autoFocus placeholder="e.g. Booking team" aria-label="Group name"
            onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void create(); if (e.key === 'Escape') setAdding(false) }} />
          <button onClick={() => void create()} disabled={busy || !newName.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Create</button>
          <button onClick={() => { setAdding(false); setNewName('') }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
        </div>
      )}

      {groups.length === 0 && !adding && <p className="text-xs text-gray-400">No groups yet.</p>}
      <div className="flex flex-wrap gap-1.5">
        {groups.map(g => (
          <button
            key={g.id} onClick={() => { setOpenId(openId === g.id ? null : g.id); reset(); setRenaming(false) }} aria-pressed={openId === g.id}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${openId === g.id ? 'bg-accent text-white' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'}`}
          >
            {g.name} · {g.memberIds.filter(id => grid.rows.some(r => r.person.memberId === id)).length}
          </button>
        ))}
      </div>

      {group && (
        <div className="mt-3 rounded-xl border border-gray-100 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {renaming ? (
              <>
                <input className={`${inputClass} max-w-xs`} value={draft} maxLength={60} autoFocus aria-label="Group name" onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void rename(); if (e.key === 'Escape') setRenaming(false) }} />
                <button onClick={() => void rename()} disabled={busy || !draft.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Save</button>
                <button onClick={() => setRenaming(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">Cancel</button>
              </>
            ) : (
              <>
                <span className="text-sm font-semibold">{group.name}</span>
                <button onClick={() => { setDraft(group.name); setRenaming(true) }} className="text-xs font-medium text-gray-500 hover:text-gray-900">Rename</button>
                <button onClick={() => setConfirm(confirm === 'delete' ? null : 'delete')} className="ml-auto text-xs font-medium text-red-600 hover:underline">Delete group</button>
              </>
            )}
          </div>

          {confirm === 'delete' && (
            <div role="alert" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p>Delete the group &ldquo;{group.name}&rdquo;? Nobody loses any access: a group only remembers who is in it.</p>
              <div className="mt-2 flex gap-2">
                <button onClick={() => void remove()} disabled={busy} className="rounded-lg bg-accent px-2.5 py-1 font-medium text-white hover:bg-accent-hover disabled:opacity-50">Delete group</button>
                <button onClick={() => setConfirm(null)} className="rounded-lg border border-amber-200 px-2.5 py-1 font-medium hover:bg-amber-100">Keep</button>
              </div>
            </div>
          )}

          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Who is in it</div>
          {grid.rows.length === 0 ? <p className="text-xs text-gray-400">Invite people first, then add them here.</p> : (
            <div className="mb-4 flex flex-wrap gap-1.5">
              {grid.rows.map(r => {
                const on = group.memberIds.includes(r.person.memberId)
                return (
                  <button key={r.person.memberId} onClick={() => void toggle(r.person.memberId)} disabled={busy} aria-pressed={on}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${on ? 'bg-accent text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    {on ? '✓ ' : ''}{r.person.label}
                  </button>
                )
              })}
            </div>
          )}

          <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Give everyone in this group a role</div>
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Artist" value={artistId} onChange={e => { setArtistId(e.target.value); reset() }} className="rounded-lg border border-gray-200 bg-canvas px-2 py-1.5 text-sm">
              <option value="">Choose an artist…</option>
              {artists.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select aria-label="Role" value={roleKey} onChange={e => { setRoleKey(e.target.value); reset() }} className="rounded-lg border border-gray-200 bg-canvas px-2 py-1.5 text-sm">
              <option value="">Choose a role…</option>
              <option value={NONE}>No access</option>
              {LEVELS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
            </select>
            <button onClick={() => void apply()} disabled={busy || !plan || plan.change.length === 0}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">
              {busy ? 'Saving…' : confirm === 'apply' ? 'Yes, do it' : plan ? `Apply to ${plan.change.length} ${plan.change.length === 1 ? 'person' : 'people'}` : 'Apply'}
            </button>
          </div>
          {plan && (
            <p className="mt-2 text-xs text-gray-500">
              {plan.change.length === 0 ? `Nothing to change: everyone in this group already has that for ${artistName}.` : `${plan.change.length} would change${plan.same.length ? `, ${plan.same.length} already ${plan.same.length === 1 ? 'has' : 'have'} it` : ''}.`}
              {plan.missing > 0 && ` ${plan.missing} ${plan.missing === 1 ? 'person in the list is' : 'people in the list are'} no longer on the team (or became an admin) and are skipped.`}
            </p>
          )}
          {confirm === 'apply' && (
            <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {roleKey === ADMIN_KEY ? POINT_PERSON_WARNING : `${plan?.change.length ?? 0} ${plan?.change.length === 1 ? 'person' : 'people'} will no longer be able to open ${artistName}.`}
            </p>
          )}
          {result && <p role="status" className="mt-2 text-xs text-green-700">{result}</p>}
          {problem && <p role="alert" className="mt-2 text-xs text-red-600">{problem}</p>}
        </div>
      )}
    </section>
  )
}
