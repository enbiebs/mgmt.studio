'use client'
// ──────────────────────────────────────────────────────────
//  AddTodo — the quick "Add a to-do" bar at the top of Today. Type it and press Enter; the artist, the
//  due date and who it is for sit underneath. A date typed at the end ("... friday", "... tomorrow") is
//  picked up on its own. Everything defaults to what was used last, so a to-do is usually one line.
// ──────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { notify } from '@/lib/notify'
import { parseQuickTodo, peopleFor } from '@/lib/tasks'
import { recallLastArtist, rememberLastArtist, useMe } from '@/lib/useToday'
import { today } from '@/lib/utils'
import { Icon } from '@/components/ui/Icon'

const SELECT = 'px-2 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-lg text-gray-600 hover:border-gray-200 max-w-[170px] truncate'

/** `forClient` fixes the artist (used on an artist's own Projects page, where there is nothing to pick). */
export function AddTodo({ forClient }: { forClient?: string } = {}) {
  const data = useStore(s => s.data)
  const people = useStore(s => s.workspacePeople)
  const hasAccess = useStore(s => s.hasAccess)
  const accessibleClientIds = useStore(s => s.accessibleClientIds)
  const grants = useStore(s => s.grants)
  const addTask = useStore(s => s.addTask)
  const deleteTask = useStore(s => s.deleteTask)
  const me = useMe()

  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState('')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState<string | null>(null)   // null = still the default (me)
  const [about, setAbout] = useState('')

  // The artists this person may add a to-do for.
  const roster = useMemo(() => {
    void grants
    const ids = accessibleClientIds()
    const all = ids === 'all' ? data.clients : data.clients.filter(c => ids.includes(c.id))
    return all.filter(c => (!forClient || c.id === forClient) && hasAccess('projects', c.id, true))
  }, [data, grants, accessibleClientIds, hasAccess, forClient])

  // The artist picked here, else the one used last, else the first real (non-demo) artist.
  const clientId = useMemo(() => {
    if (roster.some(c => c.id === picked)) return picked
    const last = recallLastArtist()
    return (roster.find(c => c.id === last) ?? roster.find(c => !c.isDemo) ?? roster[0])?.id ?? ''
  }, [roster, picked])

  const client = roster.find(c => c.id === clientId)
  const options = useMemo(() => {
    const list = clientId ? peopleFor(people, clientId, me) : []
    // If the list could not be loaded, you can still give it to yourself.
    return me && !list.some(p => p.userId === me) ? [{ userId: me, label: 'Me' }, ...list] : list
  }, [people, clientId, me])
  const given = assignee ?? me ?? ''
  const shows = useMemo(() => {
    if (!clientId || !hasAccess('tour', clientId, true)) return []     // a to-do about a show is saved under Tour, so it needs Tour edit access
    const cutoff = today()
    return (client?.tour.shows ?? [])
      .filter(s => s.status !== 'cancelled' && !s.historyOnly && s.date >= cutoff)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 25)
  }, [client, clientId, hasAccess])

  if (roster.length === 0) return null

  function submit() {
    const typed = title.trim()
    if (!typed || !client) return
    // A date typed at the end of the line counts, unless one was picked.
    const parsed = parseQuickTodo(typed, today())
    const id = addTask(client.id, {
      title: due ? typed : parsed.title,
      dueDate: due || parsed.dueDate,
      assigneeId: given || undefined,
      link: about ? { type: 'show', id: about } : undefined,
    })
    if (!id) return
    rememberLastArtist(client.id)
    if (given && given !== me) {
      const who = people.find(p => p.userId === given)?.label ?? 'them'
      notify(`Added to ${who}'s list`, { label: 'Undo', run: () => deleteTask(client.id, id) })
    }
    setTitle(''); setDue(''); setAbout('')
  }

  return (
    <section className={`${forClient ? 'mb-3' : 'mb-6'} bg-canvas border border-gray-100 rounded-2xl p-3 md:p-4`}>
      <div className="flex items-center gap-2">
        <Icon name="plus" className="w-4 h-4 text-gray-400 ml-1" />
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
          maxLength={300}
          aria-label="Add a to-do"
          placeholder="Add a to-do, e.g. “send the W9 friday”"
          className="flex-1 min-w-0 py-1.5 text-sm bg-transparent outline-none placeholder:text-gray-400"
        />
        <button
          onClick={submit} disabled={!title.trim()}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-default transition-colors"
        >
          Add
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2 pl-7">
        {!forClient && (
          <select aria-label="Artist" value={clientId} onChange={e => { setPicked(e.target.value); setAssignee(null); setAbout('') }} className={SELECT}>
            {roster.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select aria-label="Given to" value={given} onChange={e => setAssignee(e.target.value)} className={SELECT}>
          <option value="">Nobody yet</option>
          {options.map(p => <option key={p.userId} value={p.userId}>{p.userId === me ? 'Me' : p.label}</option>)}
        </select>
        <input type="date" aria-label="Due date" value={due} onChange={e => setDue(e.target.value)} className={SELECT} />
        {shows.length > 0 && (
          <select aria-label="About a show" value={about} onChange={e => setAbout(e.target.value)} className={SELECT}>
            <option value="">About a show (optional)</option>
            {shows.map(s => <option key={s.id} value={s.id}>{[s.venue, s.city].filter(Boolean).join(' · ') || 'Show'} · {s.date.slice(5)}</option>)}
          </select>
        )}
      </div>
    </section>
  )
}
