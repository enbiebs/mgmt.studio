'use client'
// ──────────────────────────────────────────────────────────
//  ArtistView — Clean artist-facing portal
//
//  This is what the artist sees. It shows:
//    • Their releases (simplified stage progress)
//    • Upcoming confirmed shows
//    • Scheduled content
//    • Their personal todo list
//    • A form to submit requests to management
//
//  It does NOT show: banking splits, royalty percentages,
//  internal team assignments, deal negotiations, or any
//  management operational details.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import type { ProjectType } from '@/types'
import { initials, fmt } from '@/lib/utils'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { STATUS_CONFIG, STAKEHOLDER_TOOLTIPS } from '@/components/manager/ProjectsView'

/** Compact number formatter for big at-a-glance stats: 1.8M, 220K, 940 */
function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`
  return `${n}`
}

// ── Stage display (simplified — no internal process labels) ─
const STAGE_DISPLAY: Record<string, { label: string; pct: number; color: string }> = {
  track:  { label: 'Recording',  pct: 25,  color: '#e2e8f0' },
  mix:    { label: 'Mixing',     pct: 50,  color: '#93c5fd' },
  master: { label: 'Mastering',  pct: 75,  color: '#4c8df6' },
  done:   { label: 'Ready',      pct: 100, color: '#22c55e' },
}

const REQUEST_TYPE_LABELS: Record<ProjectType, string> = {
  release:      'Release / Single',
  show:         'Show / Booking',
  content:      'Content / Press',
  'brand-deal': 'Brand / Partnership',
  merch:        'Merch',
  other:        'General request',
}

export function ArtistView() {
  const client = useStore(s => s.getClient())
  const { addArtistTodo, toggleArtistTodo, deleteArtistTodo, addProject, openModal, modal, closeModal } = useStore()
  const [newTodo, setNewTodo]   = useState('')
  const [showDone, setShowDone] = useState(false)

  if (!client) return null

  const today = new Date().toISOString().slice(0, 10)

  // Releases
  const album = client.songs.albums[0]
  const tracks = album?.tracks ?? []

  // Upcoming shows (confirmed only — no holds or cancelled)
  const upcomingShows = client.tour.shows
    .filter(s => s.status === 'confirmed' && s.date >= today)
    .slice(0, 5)

  // Scheduled content (upcoming posts)
  const upcomingPosts = client.content.posts
    .filter(p => p.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4)

  // Artist todos
  const todos = client.artistTodos ?? []
  const activeTodos = todos.filter(t => !t.done)
  const doneTodos   = todos.filter(t => t.done)

  // Requests this artist has sent to management — newest first, so they
  // can see what happened after they hit "Submit" instead of it vanishing.
  const myRequests = (client.projects ?? [])
    .filter(p => p.fromArtist)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  // Business snapshot (headline numbers only — no splits/percentages)
  const usd = client.business.royalties.streams.filter(s => s.currency === 'USD').reduce((a, b) => a + b.amount, 0)
  const gbp = client.business.royalties.streams.filter(s => s.currency === 'GBP').reduce((a, b) => a + b.amount, 0)
  const royStr = [usd > 0 ? fmt(usd, 'USD') : '', gbp > 0 ? fmt(gbp, 'GBP') : ''].filter(Boolean).join(' · ') || '—'
  const pendingPayouts = client.business.banking.deposits.filter(d => !d.done).length
  const regIssues = client.business.catalog.works.filter(w => w.bmi === 'warn' || w.sx === 'warn' || w.ppl === 'warn').length

  // Analytics snapshot
  const a = client.analytics
  const listenersUp = a?.streaming?.monthlyListenersPct >= 0

  // Fandom snapshot
  const f = client.fandom

  function handleAddTodo(e: React.FormEvent) {
    e.preventDefault()
    if (!newTodo.trim()) return
    addArtistTodo(newTodo.trim())
    setNewTodo('')
  }

  // Overall progress for the album
  const stageOrder = ['track', 'mix', 'master', 'done']
  const avgPct = tracks.length
    ? Math.round(tracks.reduce((sum, t) => sum + (STAGE_DISPLAY[t.stage]?.pct ?? 0), 0) / tracks.length)
    : 0

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      {/* Artist hero */}
      <div className="bg-canvas border-b border-gray-100 px-6 py-5">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0"
            style={{ background: client.color }}
          >
            {initials(client.name)}
          </div>
          <div>
            <h1 className="font-serif text-2xl font-medium">{client.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{client.genre}</p>
          </div>
          <div className="ml-auto">
            <button
              onClick={() => openModal('submit-request')}
              className="px-4 py-2 bg-[#4c8df6] text-white text-sm font-semibold rounded-xl hover:bg-blue-600 transition-colors"
            >
              Submit a request
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6">

        {/* ── Releases ── */}
        <div className="bg-canvas rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              {album?.title ?? 'Your Music'}
            </div>
            <div className="text-xs text-gray-400">{avgPct}% complete</div>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#4c8df6] transition-all"
              style={{ width: `${avgPct}%` }}
            />
          </div>

          {/* Track list */}
          <div className="flex flex-col gap-1.5">
            {tracks.map(track => {
              const stage = STAGE_DISPLAY[track.stage] ?? STAGE_DISPLAY.track
              return (
                <div key={track.id} className="flex items-center gap-3 py-1">
                  <span className="text-xs text-gray-300 w-4 text-right flex-shrink-0">{track.num}</span>
                  <span className="flex-1 text-sm truncate">{track.title}</span>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{
                      background: stage.color + '20',
                      color: track.stage === 'done' ? '#16a34a' : track.stage === 'master' ? '#2563eb' : '#64748b',
                    }}
                  >
                    {stage.label}
                  </span>
                </div>
              )
            })}
            {tracks.length === 0 && (
              <p className="text-sm text-gray-300 text-center py-4">No tracks yet</p>
            )}
          </div>
        </div>

        {/* ── Upcoming Shows ── */}
        <div className="bg-canvas rounded-2xl border border-gray-100 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">
            Upcoming Shows
          </div>

          {upcomingShows.length === 0 ? (
            <div className="text-sm text-gray-300 text-center py-6">No upcoming shows</div>
          ) : (
            <div className="flex flex-col gap-3">
              {upcomingShows.map(show => {
                const d = new Date(show.date + 'T12:00:00')
                const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase()
                const day   = d.getDate()
                return (
                  <div key={show.id} className="flex items-center gap-4">
                    <div className="w-10 text-center flex-shrink-0">
                      <div className="text-[9px] font-bold text-gray-400">{month}</div>
                      <div className="font-serif text-lg font-semibold leading-none">{day}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{show.venue}</div>
                      <div className="text-xs text-gray-400">{show.city} · {show.time}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Scheduled Content ── */}
        <div className="bg-canvas rounded-2xl border border-gray-100 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">
            Coming Up — Content
          </div>

          {upcomingPosts.length === 0 ? (
            <div className="text-sm text-gray-300 text-center py-6">Nothing scheduled yet</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {upcomingPosts.map(post => {
                const d = new Date(post.date + 'T12:00:00')
                const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                return (
                  <div key={post.id} className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-[#4c8df6] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{post.title}</span>
                      <span className="text-xs text-gray-400 ml-2">{label} · {post.time}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 uppercase font-medium">{post.type}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Business ── */}
        <div className="bg-canvas rounded-2xl border border-gray-100 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Business</div>
          <div className="flex items-end justify-between">
            <div>
              <div className="font-serif text-2xl font-medium">{royStr}</div>
              <div className="text-xs text-gray-400 mt-0.5">royalties owed · {client.business.royalties.streams.length} streams</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {pendingPayouts > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">{pendingPayouts} pending payout{pendingPayouts !== 1 ? 's' : ''}</span>
              )}
              {regIssues > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-600">{regIssues} reg issue{regIssues !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Analytics ── */}
        <div className="bg-canvas rounded-2xl border border-gray-100 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Analytics</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="font-serif text-2xl font-medium">{fmtCompact(a?.streaming?.monthlyListeners ?? 0)}</div>
              <div className={`text-xs mt-0.5 ${listenersUp ? 'text-green-600' : 'text-red-500'}`}>
                {listenersUp ? '↑' : '↓'} {Math.abs(a?.streaming?.monthlyListenersPct ?? 0)}% monthly listeners
              </div>
            </div>
            <div>
              <div className="font-serif text-2xl font-medium">{a?.momentumScore ?? 0}<span className="text-sm text-gray-300">/100</span></div>
              <div className="text-xs text-gray-400 mt-0.5">momentum score</div>
            </div>
          </div>
        </div>

        {/* ── Fandom ── */}
        <div className="bg-canvas rounded-2xl border border-gray-100 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Fandom</div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="font-serif text-2xl font-medium">{fmtCompact(f?.totalFans ?? 0)}</div>
              <div className="text-xs text-gray-400 mt-0.5">total fans</div>
            </div>
            <div>
              <div className="font-serif text-2xl font-medium">{f?.avgEngagement ?? 0}%</div>
              <div className="text-xs text-gray-400 mt-0.5">avg engagement</div>
            </div>
          </div>
        </div>

        {/* ── My Todos ── */}
        <div className="bg-canvas rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
              My To-Dos
            </div>
            {doneTodos.length > 0 && (
              <button
                onClick={() => setShowDone(!showDone)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showDone ? 'Hide' : `Show ${doneTodos.length} done`}
              </button>
            )}
          </div>

          {/* Add todo */}
          <form onSubmit={handleAddTodo} className="flex gap-2 mb-3">
            <input
              className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm placeholder:text-gray-300 focus:outline-none focus:border-[#4c8df6] transition-colors"
              placeholder="Add a to-do..."
              value={newTodo}
              onChange={e => setNewTodo(e.target.value)}
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Add
            </button>
          </form>

          {/* Active todos */}
          <div className="flex flex-col gap-1">
            {activeTodos.length === 0 && !showDone && (
              <p className="text-sm text-gray-300 text-center py-2">All caught up!</p>
            )}
            {activeTodos.map(todo => (
              <div key={todo.id} className="flex items-start gap-2.5 py-1 group">
                <button
                  onClick={() => toggleArtistTodo(todo.id)}
                  className="w-4 h-4 mt-0.5 rounded border-2 border-gray-300 hover:border-[#4c8df6] flex-shrink-0 transition-colors"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm">{todo.title}</span>
                  {todo.dueDate && (
                    <span className={`ml-2 text-[11px] ${todo.dueDate < today ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                      {todo.dueDate < today ? 'Overdue · ' : ''}{todo.dueDate}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => deleteArtistTodo(todo.id)}
                  className="text-gray-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            ))}

            {/* Done todos */}
            {showDone && doneTodos.map(todo => (
              <div key={todo.id} className="flex items-start gap-2.5 py-1 opacity-50 group">
                <button
                  onClick={() => toggleArtistTodo(todo.id)}
                  className="w-4 h-4 mt-0.5 rounded border-2 border-green-400 bg-green-400 flex-shrink-0 flex items-center justify-center text-white text-[10px]"
                >
                  ✓
                </button>
                <span className="text-sm line-through text-gray-400 flex-1">{todo.title}</span>
                <button
                  onClick={() => deleteArtistTodo(todo.id)}
                  className="text-gray-200 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 text-lg leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ── My Requests — status readback on what was submitted above ── */}
        <div className="bg-canvas rounded-2xl border border-gray-100 p-5">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">
            My Requests
          </div>
          {myRequests.length === 0 ? (
            <div className="text-sm text-gray-300 text-center py-6">No requests submitted yet</div>
          ) : (
            <div className="flex flex-col gap-2">
              {myRequests.map(project => {
                const sc = STATUS_CONFIG[project.status]
                return (
                  <div key={project.id} className="border border-gray-100 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{project.title}</span>
                      <span className="text-[10px] text-gray-400 uppercase font-medium tracking-wide">
                        {REQUEST_TYPE_LABELS[project.type]}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${sc.bg}`}>
                        {sc.label}
                      </span>
                      {project.assignee && (
                        <span className="text-[11px] text-gray-400" title={STAKEHOLDER_TOOLTIPS[project.assignee]}>
                          → {project.assignee}
                        </span>
                      )}
                      {project.dueDate && (
                        <span className="text-[11px] text-gray-400 ml-auto">Due {project.dueDate}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Submit Request Modal */}
      {modal === 'submit-request' && <SubmitRequestModal onClose={closeModal} />}
    </div>
  )
}

// ── Submit Request Modal ───────────────────────────────────
function SubmitRequestModal({ onClose }: { onClose: () => void }) {
  const { addProject } = useStore()
  const [title, setTitle] = useState('')
  const [type, setType]   = useState<ProjectType>('other')
  const [notes, setNotes] = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    addProject(title.trim(), type, undefined, undefined, true)
    onClose()
  }

  return (
    <Modal title="Submit a Request" onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">
        Send a request to your management team. They'll pick it up and follow up with you.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormField label="What do you need?">
          <input
            className={inputClass}
            placeholder="e.g. Book me for Coachella 2027"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
        </FormField>

        <FormField label="Category">
          <select className={selectClass} value={type} onChange={e => setType(e.target.value as ProjectType)}>
            {(Object.entries(REQUEST_TYPE_LABELS) as [ProjectType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Notes (optional)">
          <textarea
            className={`${inputClass} min-h-[80px] resize-none`}
            placeholder="Any details that will help your team..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </FormField>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="flex-1 py-2 bg-[#4c8df6] text-white font-semibold rounded-xl text-sm hover:bg-blue-600 transition-colors"
          >
            Send to management
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 border border-gray-200 text-gray-500 font-medium rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
