'use client'
// ──────────────────────────────────────────────────────────
//  RosterMusic — "All artists" → Music: every release across your artists on one timeline, with how far along each one is.
//  Opening a row goes to that release's Status page on the artist's own Music pages. Read-only: nothing is edited from here.
//  What each person sees (which artists, which numbers) is decided in lib/roster-music.ts.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { RELEASE_TYPE_LABEL, today } from '@/lib/utils'
import { dayWord, plural, whenWord } from '@/lib/roster-summary'
import {
  buildRosterMusic, defaultMusicFilter, filterReleases, musicAccessFor, musicCapabilities, musicStats,
  type MusicFilter, type ReleaseRow,
} from '@/lib/roster-music'
import { useRosterClients } from '@/components/layout/nav'

const FILTERS: { key: MusicFilter; label: string }[] = [
  { key: 'ahead', label: 'Coming up' }, { key: 'undated', label: 'No date yet' }, { key: 'out', label: 'Released' }, { key: 'all', label: 'Everything' },
]
// Worded about "the releases you can see": someone sent a few releases cannot say anything about the artist's whole catalogue.
const EMPTY: Record<MusicFilter, string> = {
  ahead: 'None of the releases you can see is coming up.',
  undated: 'None of the releases you can see is waiting for a date.',
  out: 'None of the releases you can see is out yet.',
  all: 'No releases.',
}
const PAGE = 150   // rows drawn at a time, so a long list stays quick

const SEGMENT = 'inline-flex flex-wrap p-0.5 bg-gray-100 rounded-lg text-xs font-medium'
const segment = (on: boolean) => `px-3 py-1 rounded-md transition-colors ${on ? 'bg-canvas shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`
const SELECT = 'px-2.5 py-1.5 text-xs bg-canvas border border-gray-200 rounded-lg text-gray-700 hover:border-gray-300 max-w-[180px]'
const DEMO_CHIP = 'text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 rounded-full px-1.5 flex-shrink-0'
const COLS = 'lg:grid-cols-[112px_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.6fr)]'

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="glass bg-canvas border border-gray-100 rounded-2xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
      <div className="font-serif text-xl font-semibold leading-tight mt-0.5 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

/** "Nov 14", or "Nov 14, 2027" when it is not this year (the list reaches back and forward a long way). */
const dateLabel = (iso: string, now: string) => (iso.slice(0, 4) === now.slice(0, 4) ? dayWord(iso) : `${dayWord(iso)}, ${iso.slice(0, 4)}`)

function Bar({ done, total }: { done: number; total: number }) {
  return (
    <span className="block h-1 w-full max-w-[140px] rounded-full bg-gray-100 overflow-hidden" aria-hidden>
      <span className="block h-full rounded-full bg-green-500" style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }} />
    </span>
  )
}

export function RosterMusic() {
  const roster = useRosterClients()
  const hasAccess = useStore(s => s.hasAccess)
  const isShareOnly = useStore(s => s.isShareOnly)
  const roleFor = useStore(s => s.roleFor)
  const openClient = useStore(s => s.openClient)
  const setSection = useStore(s => s.setSection)
  const setSongsSub = useStore(s => s.setSongsSub)
  const setSelectedAlbum = useStore(s => s.setSelectedAlbum)
  const [chosen, setChosen] = useState<MusicFilter | undefined>(undefined)   // undefined until the person picks one
  const [clientId, setClientId] = useState('')
  const [limit, setLimit] = useState(PAGE)

  const day = today()
  const inputs = roster.map(client => ({ client, access: musicAccessFor(hasAccess, isShareOnly, client.id, roleFor(client.id)) }))
  const caps = musicCapabilities(inputs.map(i => i.access))

  if (!caps.list) {
    return (
      <>
        <h1 className="font-serif text-[26px] font-medium leading-tight">Music</h1>
        <p className="text-sm text-gray-400 mt-0.5">No artists with a music page you can open yet.</p>
      </>
    )
  }

  const rows = buildRosterMusic(inputs, day)
  const stats = musicStats(rows)
  const filter = chosen ?? defaultMusicFilter(rows)
  const people = [...new Map(rows.map(r => [r.clientId, r.clientName])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const picked = people.some(([id]) => id === clientId) ? clientId : ''
  const shown = filterReleases(rows, { filter, clientId: picked || undefined })
  const drawn = shown.slice(0, limit)
  const partial = [...new Set(rows.filter(r => !r.full).map(r => r.clientName))]
  const reset = () => setLimit(PAGE)

  // (openClient() clears the selected release, so it runs first.)
  const open = (r: ReleaseRow) => { openClient(r.clientId); setSection('songs'); setSongsSub('status'); setSelectedAlbum(r.albumId) }

  return (
    <>
      <div className="mb-5">
        <h1 className="font-serif text-[26px] font-medium leading-tight">Music</h1>
        <p className="text-sm text-gray-400 mt-0.5">Every release across your artists and how far along it is. Open one to go to that release.</p>
      </div>

      {caps.counts && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <Stat label="Coming up" value={String(stats.ahead)} sub={stats.ahead === 1 ? 'release' : 'releases'} />
          <Stat label="Next 30 days" value={String(stats.soon)} sub={stats.soon === 1 ? 'release' : 'releases'} />
          <Stat label="Songs not finished" value={String(stats.unfinished)} sub="across all releases" />
          <Stat label="No date yet" value={String(stats.undated)} sub={stats.undated > 0 ? 'need a release date' : undefined} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div role="group" aria-label="Which releases" className={SEGMENT}>
          {FILTERS.map(f => (
            <button key={f.key} aria-pressed={filter === f.key} onClick={() => { setChosen(f.key); reset() }} className={segment(filter === f.key)}>{f.label}</button>
          ))}
        </div>
        {people.length > 1 && (
          <select aria-label="Artist" value={picked} onChange={e => { setClientId(e.target.value); reset() }} className={SELECT}>
            <option value="">All artists</option>
            {people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">{rows.length === 0 ? 'No releases yet.' : EMPTY[filter]}</p>
      ) : (
        <div className="glass bg-canvas border border-gray-100 rounded-2xl overflow-hidden">
          <div className={`hidden lg:grid ${COLS} gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/60 text-[10px] font-bold uppercase tracking-widest text-gray-400`}>
            <span>Out</span><span>Artist</span><span>Release</span><span>Songs</span><span>Release checklist</span>
          </div>
          {drawn.map(r => (
            <button
              key={`${r.clientId}:${r.albumId}`}
              onClick={() => open(r)}
              className={`w-full text-left px-4 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors flex flex-wrap items-center gap-x-3 gap-y-1 lg:grid ${COLS}`}
            >
              <span className="flex items-baseline gap-2 lg:block">
                {r.date ? (
                  <>
                    <span className="text-sm font-semibold tabular-nums">{dateLabel(r.date, day)}</span>
                    <span className="text-xs text-gray-400 lg:block">{r.when === 'ahead' ? whenWord(r.date, day) : 'released'}</span>
                  </>
                ) : <span className="text-sm text-gray-400">No date yet</span>}
              </span>
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: r.clientColor }} aria-hidden />
                <span className="truncate text-sm font-medium">{r.clientName}</span>
                {r.demo && <span className={DEMO_CHIP}>Demo</span>}
              </span>
              <span className="basis-full lg:basis-auto min-w-0 block">
                <span className="block truncate text-sm">{r.title}</span>
                <span className="block truncate text-xs text-gray-400">{RELEASE_TYPE_LABEL[r.type]}</span>
              </span>
              <span className="min-w-0 block">
                {r.songsTotal === 0 ? <span className="text-xs text-gray-400">No songs yet</span> : (
                  <>
                    <span className="block truncate text-xs text-gray-600">{r.songsDone} of {plural(r.songsTotal, 'song')} finished</span>
                    <Bar done={r.songsDone} total={r.songsTotal} />
                  </>
                )}
              </span>
              <span className="basis-full lg:basis-auto min-w-0 block">
                {/* A release that is already out and was never ticked off did not use the checklist: "0 of 18" would read like unfinished work. */}
                <span className="block truncate text-xs text-gray-600">{r.when === 'out' && r.stepsDone === 0 ? '\u2014' : `${r.stepsDone} of ${r.stepsTotal} steps done`}</span>
                {r.nextStep && <span className="block truncate text-xs text-gray-400">Next: {r.nextStep}</span>}
              </span>
            </button>
          ))}
          {shown.length > drawn.length && (
            <button onClick={() => setLimit(l => l + PAGE)} className="w-full px-4 py-2.5 text-xs font-medium text-accent hover:bg-gray-50 transition-colors">
              Show more ({shown.length - drawn.length} more)
            </button>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-1 text-xs text-gray-400">
        {partial.length > 0 && <p>{partial.join(', ')}: you were sent single releases there, so only those are listed and nothing is added up from them.</p>}
        {caps.counts && rows.some(r => r.demo) && <p>Practice artists are listed with a Demo tag and are never counted in the numbers at the top.</p>}
      </div>
    </>
  )
}
