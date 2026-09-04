'use client'
import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { stageLabel, stageBadgeClass, isStale, uid } from '@/lib/utils'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { TrackWaveform } from './TrackWaveform'
import { getTrackAudioUrl } from '@/lib/db'
import type { Stage, Track, TrackPriority, TrackCredit, TrackNote, Album, ReleaseType } from '@/types'

const PRIORITY_LABEL: Record<TrackPriority, string> = {
  'lead-single': 'Lead Single',
  single:        'Single',
  'album-cut':   'Album Cut',
}
const PRIORITY_STYLE: Record<TrackPriority, string> = {
  'lead-single': 'bg-pink-100 text-pink-700',
  single:        'bg-cyan-100 text-cyan-700',
  'album-cut':   'bg-gray-100 text-gray-500',
}

const RELEASE_TYPE_LABEL: Record<ReleaseType, string> = { single: 'Single', ep: 'EP', album: 'Album' }

const STAGES: Stage[] = ['track', 'mix', 'master', 'done']

// A client can have several releases — a single, an EP, a full album —
// each grouping its own tracks. Every client always has at least one
// (created alongside the client), so "delete release" only appears once
// there's a second one to fall back to.
export function SongsView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('songs'))
  const { deleteAlbum } = useStore()
  const [addTrackFor, setAddTrackFor] = useState<string | null>(null)
  const [addReleaseOpen, setAddReleaseOpen] = useState(false)
  const [filter, setFilter] = useState<Stage | 'all'>('all')
  const [detailTrackId, setDetailTrackId] = useState<string | null>(null)

  if (!client) return null
  const albums = client.songs.albums
  const allTracks = albums.flatMap(a => a.tracks)
  const done   = allTracks.filter(t => t.stage === 'done').length
  const inProd = allTracks.filter(t => ['mix', 'master'].includes(t.stage)).length
  const stalled = allTracks.filter(t => isStale(t.stage, t.touched)).length
  const detailTrack = allTracks.find(t => t.id === detailTrackId) ?? null

  function handleDeleteAlbum(album: Album) {
    if (confirm(`Delete "${album.title}"? This removes all ${album.tracks.length} of its tracks too.`)) {
      deleteAlbum(album.id)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Roster header — aggregate across every release */}
      <div className="flex items-start gap-4 mb-6">
        <div
          className="w-[76px] h-[76px] rounded-xl flex items-center justify-center text-white text-3xl flex-shrink-0"
          style={{ background: client.color }}
        >
          ♪
        </div>
        <div>
          <div className="font-serif text-2xl font-medium">{client.name}</div>
          <div className="text-sm text-gray-400 mt-1">
            {albums.length} {albums.length === 1 ? 'release' : 'releases'} · {allTracks.length} tracks · {done} done · {inProd} in mix/master
            {stalled > 0 && <span className="text-amber-500"> · {stalled} stalled 10d+</span>}
          </div>
          {editable && (
            <button
              onClick={() => setAddReleaseOpen(true)}
              className="mt-2 px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              + New release
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-4 text-[11px] text-gray-400 mb-4">
        {[['bg-gray-800','Done'],['bg-purple-400','Mix'],['bg-blue-400','Master'],['bg-gray-100','Track']].map(([bg, lbl]) => (
          <span key={lbl} className="flex items-center gap-1">
            <span className={`inline-block w-2 h-2 rounded-sm ${bg}`} />{lbl}
          </span>
        ))}
      </div>

      {/* Stage filter chips — applies across every release below */}
      <div className="flex gap-1.5 mb-5">
        {(['all', ...STAGES] as const).map(s => {
          const count = s === 'all' ? allTracks.length : allTracks.filter(t => t.stage === s).length
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                filter === s ? 'bg-gray-900 text-canvas' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {s === 'all' ? 'All' : stageLabel(s)} <span className="opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {albums.map(album => (
        <ReleaseSection
          key={album.id}
          album={album}
          editable={editable}
          filter={filter}
          onOpenTrack={setDetailTrackId}
          onAddTrack={() => setAddTrackFor(album.id)}
          onDeleteAlbum={albums.length > 1 ? () => handleDeleteAlbum(album) : undefined}
        />
      ))}

      {addTrackFor && (
        <AddTrackModal albumId={addTrackFor} onClose={() => setAddTrackFor(null)} />
      )}

      {addReleaseOpen && (
        <NewReleaseModal onClose={() => setAddReleaseOpen(false)} />
      )}

      {detailTrack && (
        <TrackDetailModal track={detailTrack} onClose={() => setDetailTrackId(null)} />
      )}
    </div>
  )
}

function ReleaseSection({ album, editable, filter, onOpenTrack, onAddTrack, onDeleteAlbum }: {
  album: Album
  editable: boolean
  filter: Stage | 'all'
  onOpenTrack: (trackId: string) => void
  onAddTrack: () => void
  onDeleteAlbum?: () => void
}) {
  const { advanceTrack, deleteTrack } = useStore()
  const tracks = album.tracks
  const visible = filter === 'all' ? tracks : tracks.filter(t => t.stage === filter)
  const releaseType = album.type ?? 'album'

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-serif text-lg font-medium truncate">{album.title}</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gray-100 text-gray-500 flex-shrink-0">
            {RELEASE_TYPE_LABEL[releaseType]}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0">{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}</span>
        </div>
        {editable && (
          <div className="flex gap-1.5 flex-shrink-0">
            <button onClick={onAddTrack} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">
              + New track
            </button>
            {onDeleteAlbum && (
              <button onClick={onDeleteAlbum} className="px-2 py-1 text-xs text-red-400 hover:bg-red-50 rounded-lg transition-colors">
                Delete release
              </button>
            )}
          </div>
        )}
      </div>

      {/* Numbered track strip — colored by stage, click to jump straight to a track */}
      {tracks.length > 0 && (
        <div className="flex gap-1 mb-3">
          {tracks.map(t => (
            <button
              key={t.id}
              onClick={() => onOpenTrack(t.id)}
              title={t.title}
              className={`flex-1 h-9 rounded-md flex items-center justify-center text-[10px] font-bold transition-opacity hover:opacity-80 ${
                t.stage === 'done'   ? 'bg-gray-800 text-canvas' :
                t.stage === 'master' ? 'bg-blue-400 text-canvas'  :
                t.stage === 'mix'    ? 'bg-purple-400 text-canvas' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {String(t.num).padStart(2, '0')}
            </button>
          ))}
        </div>
      )}

      {/* Track table */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {['#','Title','Stage','Ver','Touched','Next action',''].map(h => (
              <th key={h} className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2.5 py-1.5 border-b border-gray-100">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map(t => {
            const idx = STAGES.indexOf(t.stage)
            const stale = isStale(t.stage, t.touched)
            const openNotes = (t.rounds ?? []).reduce((sum, r) => sum + r.notes.filter(n => !n.resolved).length, 0)
            return (
              <tr
                key={t.id}
                onClick={() => onOpenTrack(t.id)}
                className="group hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <td className="px-2.5 py-2.5 text-xs text-gray-400">{String(t.num).padStart(2, '0')}</td>
                <td className="px-2.5 py-2.5">
                  <div className="flex items-center gap-1.5">
                    {stale && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title={`No update in ${t.touched}`} />}
                    <span className="font-medium">{t.title}</span>
                    {t.priority && t.priority !== 'album-cut' && (
                      <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 ${PRIORITY_STYLE[t.priority]}`}>
                        {PRIORITY_LABEL[t.priority]}
                      </span>
                    )}
                    {openNotes > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0 bg-amber-50 text-amber-600" title={`${openNotes} open note${openNotes === 1 ? '' : 's'}`}>
                        {openNotes} open
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2.5 py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${stageBadgeClass(t.stage)}`}>
                    {stageLabel(t.stage)}
                  </span>
                </td>
                <td className="px-2.5 py-2.5 text-xs text-gray-400">{t.version}</td>
                <td className="px-2.5 py-2.5 text-xs text-gray-400">{t.touched}</td>
                <td className="px-2.5 py-2.5 text-xs text-gray-400 max-w-[220px] truncate">{t.owner || '—'}</td>
                <td className="px-2.5 py-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {editable && (
                    <div className="flex gap-1.5">
                      {idx < STAGES.length - 1 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); advanceTrack(t.id) }}
                          className="px-2 py-0.5 border border-gray-200 rounded text-[11px] font-medium hover:bg-gray-100 transition-colors"
                        >
                          → {stageLabel(STAGES[idx + 1])}
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${t.title}"?`)) deleteTrack(t.id) }}
                        className="px-2 py-0.5 border border-gray-200 rounded text-[11px] text-red-400 hover:bg-red-50 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
          {visible.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-sm text-gray-300 py-8">
                {tracks.length === 0 ? 'No tracks in this release yet' : 'No tracks at this stage'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function AddTrackModal({ albumId, onClose }: { albumId: string; onClose: () => void }) {
  const { addTrack } = useStore()
  const [title, setTitle] = useState('')
  const [stage, setStage] = useState<Stage>('track')

  function handleAdd() {
    if (!title.trim()) return
    addTrack(albumId, title.trim(), stage)
    onClose()
  }

  return (
    <Modal title="Add a track" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Add track</button>
      </>
    }>
      <FormField label="Title">
        <input className={inputClass} placeholder="Track title" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Starting stage">
        <select className={selectClass} value={stage} onChange={e => setStage(e.target.value as Stage)}>
          <option value="track">Track</option>
          <option value="mix">Mix</option>
          <option value="master">Master</option>
        </select>
      </FormField>
    </Modal>
  )
}

function NewReleaseModal({ onClose }: { onClose: () => void }) {
  const { addAlbum } = useStore()
  const [title, setTitle] = useState('')
  const [type, setType] = useState<ReleaseType>('album')

  function handleCreate() {
    if (!title.trim()) return
    addAlbum(title.trim(), type)
    onClose()
  }

  return (
    <Modal title="New release" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleCreate} disabled={!title.trim()} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-40">Create</button>
      </>
    }>
      <FormField label="Title">
        <input className={inputClass} placeholder="e.g. Golden Hour" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Type">
        <select className={selectClass} value={type} onChange={e => setType(e.target.value as ReleaseType)}>
          <option value="single">Single</option>
          <option value="ep">EP</option>
          <option value="album">Album</option>
        </select>
      </FormField>
    </Modal>
  )
}

// ── Track detail — wide modal (matches the Legal template editor pattern)
// with three tabs: the original quick-edit fields, audio rounds + the
// timestamped review thread, and credits/lyrics.
type DetailTab = 'details' | 'rounds' | 'credits'

function TrackDetailModal({ track, onClose }: { track: Track; onClose: () => void }) {
  const editable = useStore(s => s.canEdit('songs'))
  const { updateTrackDetails } = useStore()
  const [tab, setTab] = useState<DetailTab>('details')

  const [title, setTitle] = useState(track.title)
  const [stage, setStage] = useState<Stage>(track.stage)
  const [priority, setPriority] = useState<TrackPriority>(track.priority ?? 'album-cut')
  const [owner, setOwner] = useState(track.owner ?? '')
  const [dueDate, setDueDate] = useState(track.dueDate ?? '')
  const [releaseDate, setReleaseDate] = useState(track.releaseDate ?? '')
  const [notes, setNotes] = useState(track.notes ?? '')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSaveDetails() {
    if (!title.trim()) return
    updateTrackDetails(track.id, {
      title: title.trim(), stage, priority,
      owner: owner.trim() || undefined,
      dueDate: dueDate || undefined,
      releaseDate: releaseDate || undefined,
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  const lc = track.labelCopy
  const openNotes = (track.rounds ?? []).reduce((sum, r) => sum + r.notes.filter(n => !n.resolved).length, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-canvas rounded-2xl shadow-2xl w-[760px] max-w-[92vw] max-h-[88vh] flex flex-col animate-in slide-in-from-bottom-3 duration-200">
        <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-3 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <div className="font-serif text-lg font-medium truncate">{track.title}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {stageLabel(track.stage)} · V{track.version} · touched {track.touched}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 flex-shrink-0 text-lg leading-none">✕</button>
        </div>

        <div className="flex gap-0.5 px-6 pt-3 flex-shrink-0">
          {([['details', 'Details'], ['rounds', `Rounds${openNotes > 0 ? ` (${openNotes})` : ''}`], ['credits', 'Credits & Lyrics']] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-gray-900 text-canvas' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === 'details' && (
            <div className="space-y-3 max-w-lg">
              <FormField label="Title">
                <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} autoFocus disabled={!editable} />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Stage">
                  <select className={selectClass} value={stage} onChange={e => setStage(e.target.value as Stage)} disabled={!editable}>
                    <option value="track">Track</option>
                    <option value="mix">Mix</option>
                    <option value="master">Master</option>
                    <option value="done">Done</option>
                  </select>
                </FormField>
                <FormField label="Priority">
                  <select className={selectClass} value={priority} onChange={e => setPriority(e.target.value as TrackPriority)} disabled={!editable}>
                    <option value="album-cut">Album Cut</option>
                    <option value="single">Single</option>
                    <option value="lead-single">Lead Single</option>
                  </select>
                </FormField>
              </div>
              <FormField label="Next action / owner">
                <input className={inputClass} placeholder="e.g. Alex — mixing, Awaiting artist approval" value={owner} onChange={e => setOwner(e.target.value)} disabled={!editable} />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Due date">
                  <input type="date" className={inputClass} value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={!editable} />
                </FormField>
                <FormField label="Target release">
                  <input type="date" className={inputClass} value={releaseDate} onChange={e => setReleaseDate(e.target.value)} disabled={!editable} />
                </FormField>
              </div>
              <FormField label="Notes">
                <textarea
                  className={`${inputClass} resize-none`}
                  rows={3}
                  placeholder="Feedback, revision requests, context for the next person picking this up…"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  disabled={!editable}
                />
              </FormField>

              {/* Read-only label copy summary — full editing lives in the Label Copy tab */}
              <div className="pt-1 border-t border-gray-100 mt-1">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5 mt-3">Label copy</div>
                <div className="text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1">
                  <span>ISRC: {lc?.isrc ? <span className="text-gray-700">{lc.isrc}</span> : <span className="text-red-400">missing</span>}</span>
                  <span>Writers: {lc?.writers || '—'}</span>
                  <span>Duration: {lc?.duration || '—'}</span>
                </div>
                <div className="text-[11px] text-gray-300 mt-1">Edit full label copy in the Label Copy tab.</div>
              </div>
            </div>
          )}

          {tab === 'rounds' && <RoundsTab track={track} editable={editable} />}
          {tab === 'credits' && <CreditsTab track={track} editable={editable} />}
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          {tab === 'details' ? (
            editable ? (
              <>
                <button onClick={onClose} className="ml-auto px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
                <button onClick={handleSaveDetails} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Save</button>
              </>
            ) : (
              <button onClick={onClose} className="ml-auto px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>
            )
          ) : (
            <button onClick={onClose} className="ml-auto px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Rounds tab — upload audio, review with a real waveform, leave
// timestamped notes, thread replies, mark resolved.
function RoundsTab({ track, editable }: { track: Track; editable: boolean }) {
  const rounds = track.rounds ?? []
  const [selectedId, setSelectedId] = useState<string | null>(rounds[rounds.length - 1]?.id ?? null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [fetchedAudio, setFetchedAudio] = useState<{ path: string; url: string | null } | null>(null)
  const [composing, setComposing] = useState<number | null>(null)
  const [composeText, setComposeText] = useState('')
  const [composeAuthor, setComposeAuthor] = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')

  const role = useStore(s => s.role)
  const { deleteTrackRound, addTrackNote, toggleTrackNoteResolved, deleteTrackNote, addTrackNoteReply } = useStore()

  // Falls back to the newest round whenever nothing (or a since-deleted
  // round) is selected — no effect needed to keep selectedId in sync.
  const selected = rounds.find(r => r.id === selectedId) ?? rounds[rounds.length - 1] ?? null

  useEffect(() => {
    if (!selected?.audioPath) return
    const path = selected.audioPath
    let cancelled = false
    getTrackAudioUrl(path).then(url => { if (!cancelled) setFetchedAudio({ path, url }) })
    return () => { cancelled = true }
  }, [selected?.audioPath])

  const audioUrl = selected?.audioPath && fetchedAudio?.path === selected.audioPath ? fetchedAudio.url : null

  const sortedNotes = selected ? [...selected.notes].sort((a, b) => a.timestamp - b.timestamp) : []
  const openCount = sortedNotes.filter(n => !n.resolved).length

  function fmtTime(s: number): string {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  function handleAddNoteAt(seconds: number) {
    setComposing(seconds)
    setComposeText('')
    setComposeAuthor(role === 'manager' ? 'Manager' : role.charAt(0).toUpperCase() + role.slice(1))
  }

  function submitNote() {
    if (!selected || composing === null || !composeText.trim() || !composeAuthor.trim()) return
    addTrackNote(track.id, selected.id, composing, composeAuthor.trim(), composeText.trim())
    setComposing(null); setComposeText('')
  }

  function submitReply(note: TrackNote) {
    if (!selected || !replyText.trim()) return
    addTrackNoteReply(track.id, selected.id, note.id, composeAuthor.trim() || (role === 'manager' ? 'Manager' : 'Team'), replyText.trim())
    setReplyingTo(null); setReplyText('')
  }

  return (
    <div className="space-y-4">
      {/* Round chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {rounds.map(r => (
          <button
            key={r.id}
            onClick={() => setSelectedId(r.id)}
            className={`group px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
              selected?.id === r.id ? 'bg-gray-900 text-canvas' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {r.label}
            <span className={`px-1 rounded text-[9px] font-bold ${selected?.id === r.id ? 'bg-white/20' : 'bg-white'}`}>{stageLabel(r.stage)}</span>
            {editable && (
              <span
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete round "${r.label}"? This removes its audio and notes.`)) deleteTrackRound(track.id, r.id) }}
                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-300"
              >
                ✕
              </span>
            )}
          </button>
        ))}
        {editable && (
          <button
            onClick={() => setUploadOpen(true)}
            className="px-2.5 py-1 border border-gray-200 rounded-full text-xs font-medium hover:bg-gray-50 transition-colors"
          >
            + Upload round
          </button>
        )}
        {rounds.length === 0 && !editable && (
          <div className="text-sm text-gray-300">No rounds uploaded yet</div>
        )}
      </div>

      {selected && (
        <>
          <TrackWaveform audioUrl={audioUrl} notes={sortedNotes} onAddNoteAt={editable ? handleAddNoteAt : () => {}} />

          {composing !== null && (
            <div className="border border-blue-200 bg-blue-50/50 rounded-lg p-3 space-y-2">
              <div className="text-xs font-semibold text-gray-600">New note at {fmtTime(composing)}</div>
              <input className={inputClass} placeholder="Your name / role (e.g. Mix Engineer)" value={composeAuthor} onChange={e => setComposeAuthor(e.target.value)} />
              <textarea className={`${inputClass} resize-none`} rows={2} placeholder="What needs attention here?" value={composeText} onChange={e => setComposeText(e.target.value)} autoFocus />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setComposing(null)} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs hover:bg-gray-50">Cancel</button>
                <button onClick={submitNote} disabled={!composeText.trim() || !composeAuthor.trim()} className="px-2.5 py-1 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 disabled:opacity-40">Add note</button>
              </div>
            </div>
          )}

          {/* Timestamped notes thread */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Timestamped notes</div>
              <div className="text-[11px] text-gray-400">{openCount} open · {sortedNotes.length - openCount} resolved</div>
            </div>
            <div className="space-y-2">
              {sortedNotes.map((n, i) => (
                <div key={n.id} className={`border rounded-lg p-3 ${n.resolved ? 'border-gray-100 opacity-60' : 'border-gray-200'}`}>
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-semibold text-gray-700">{n.author}</span>
                        <span className="text-gray-300">{fmtTime(n.timestamp)}</span>
                      </div>
                      <div className="text-sm text-gray-700 mt-0.5">{n.text}</div>
                      {n.replies.map(rep => (
                        <div key={rep.id} className="mt-1.5 pl-3 border-l-2 border-gray-100">
                          <span className="text-xs font-semibold text-gray-600">{rep.author}</span>
                          <span className="text-sm text-gray-600 ml-1.5">{rep.text}</span>
                        </div>
                      ))}
                      {editable && replyingTo === n.id ? (
                        <div className="flex gap-1.5 mt-1.5">
                          <input className={`${inputClass} text-xs py-1`} placeholder="Reply…" value={replyText} onChange={e => setReplyText(e.target.value)} autoFocus />
                          <button onClick={() => submitReply(n)} className="px-2 py-1 bg-gray-900 text-canvas text-xs rounded-lg flex-shrink-0">Reply</button>
                        </div>
                      ) : editable ? (
                        <button onClick={() => { setReplyingTo(n.id); setReplyText('') }} className="text-xs text-gray-400 hover:text-gray-600 mt-1">Reply</button>
                      ) : null}
                    </div>
                    {editable && (
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          onClick={() => toggleTrackNoteResolved(track.id, selected.id, n.id)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${n.resolved ? 'bg-gray-100 text-gray-400' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                        >
                          {n.resolved ? 'Reopen' : 'Resolve'}
                        </button>
                        <button
                          onClick={() => { if (confirm('Delete this note?')) deleteTrackNote(track.id, selected.id, n.id) }}
                          className="px-2 py-0.5 rounded text-[10px] text-red-400 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {sortedNotes.length === 0 && (
                <div className="text-sm text-gray-300 text-center py-6">No notes on this round yet</div>
              )}
            </div>
          </div>
        </>
      )}

      {uploadOpen && (
        <UploadRoundModal track={track} onClose={() => setUploadOpen(false)} onUploaded={(id) => { setSelectedId(id); setUploadOpen(false) }} />
      )}
    </div>
  )
}

function UploadRoundModal({ track, onClose, onUploaded }: { track: Track; onClose: () => void; onUploaded: (roundId: string) => void }) {
  const { addTrackRound } = useStore()
  const [label, setLabel] = useState(`Round ${(track.rounds?.length ?? 0) + 1}`)
  const [stage, setStage] = useState<Stage>(track.stage)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  async function handleUpload() {
    if (!label.trim() || !file) return
    setUploading(true)
    const roundId = await addTrackRound(track.id, label.trim(), stage, file)
    setUploading(false)
    if (roundId) onUploaded(roundId)
    else onClose()
  }

  return (
    <Modal title="Upload a round" onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={handleUpload} disabled={!label.trim() || !file || uploading} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-40">
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
      </>
    }>
      <FormField label="Label">
        <input className={inputClass} placeholder="e.g. V3, Working V2, mix ref" value={label} onChange={e => setLabel(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Stage">
        <select className={selectClass} value={stage} onChange={e => setStage(e.target.value as Stage)}>
          <option value="track">Track</option>
          <option value="mix">Mix</option>
          <option value="master">Master</option>
          <option value="done">Done</option>
        </select>
      </FormField>
      <FormField label="Audio file">
        <input
          type="file"
          accept="audio/*"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm text-gray-500 file:mr-3 file:px-2.5 file:py-1.5 file:rounded-lg file:border file:border-gray-200 file:text-xs file:font-medium file:bg-canvas hover:file:bg-gray-50"
        />
      </FormField>
    </Modal>
  )
}

// ── Credits & Lyrics tab ────────────────────────────────────
function CreditsTab({ track, editable }: { track: Track; editable: boolean }) {
  const { updateTrackCredits, updateTrackDetails } = useStore()
  const [credits, setCredits] = useState<TrackCredit[]>(track.credits ?? [])
  const [lyrics, setLyrics] = useState(track.lyrics ?? '')
  const [mixerBrief, setMixerBrief] = useState(track.mixerBrief ?? '')

  const total = credits.reduce((sum, c) => sum + (c.split || 0), 0)

  function updateCredit(id: string, patch: Partial<TrackCredit>) {
    setCredits(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
  }
  function addCredit() {
    setCredits(cs => [...cs, { id: 'credit-' + uid(), name: '', role: '', split: 0 }])
  }
  function removeCredit(id: string) {
    setCredits(cs => cs.filter(c => c.id !== id))
  }
  function saveCredits() {
    updateTrackCredits(track.id, credits.filter(c => c.name.trim()))
  }
  function saveText() {
    updateTrackDetails(track.id, { lyrics: lyrics.trim() || undefined, mixerBrief: mixerBrief.trim() || undefined })
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Credits & splits</div>
          <span className={`text-xs font-bold ${total === 100 ? 'text-green-600' : 'text-amber-500'}`}>{total}%</span>
        </div>
        <div className="space-y-1.5">
          {credits.map(c => (
            <div key={c.id} className="flex items-center gap-1.5">
              {/* w-full (in inputClass) sets width on the input itself, so each
                  input is wrapped in its own flex-1 div rather than putting
                  flex-1 directly on the input — the two width rules would
                  otherwise fight and the input could collapse to ~content-size. */}
              <div className="flex-1 min-w-0">
                <input className={inputClass} placeholder="Name" value={c.name} onChange={e => updateCredit(c.id, { name: e.target.value })} disabled={!editable} />
              </div>
              <div className="flex-1 min-w-0">
                <input className={inputClass} placeholder="Role" value={c.role} onChange={e => updateCredit(c.id, { role: e.target.value })} disabled={!editable} />
              </div>
              <div className="w-20 flex-shrink-0">
                <input type="number" className={inputClass} value={c.split} onChange={e => updateCredit(c.id, { split: Number(e.target.value) })} disabled={!editable} />
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">%</span>
              {editable && (
                <button onClick={() => removeCredit(c.id)} className="text-gray-300 hover:text-red-400 text-xs flex-shrink-0 px-1">✕</button>
              )}
            </div>
          ))}
          {credits.length === 0 && <div className="text-sm text-gray-300 text-center py-4">No credits added yet</div>}
        </div>
        {editable && (
          <div className="flex gap-2 mt-2">
            <button onClick={addCredit} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">+ Add credit</button>
            <button onClick={saveCredits} className="px-2.5 py-1 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors">Save credits</button>
          </div>
        )}
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Mixer brief</div>
        <textarea
          className={`${inputClass} resize-none`}
          rows={3}
          placeholder="Reference tracks, tone, anything the mixer should know…"
          value={mixerBrief}
          onChange={e => setMixerBrief(e.target.value)}
          onBlur={saveText}
          disabled={!editable}
        />
      </div>

      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Lyrics</div>
        <textarea
          className={`${inputClass} resize-none font-mono`}
          rows={10}
          placeholder="Paste lyrics here…"
          value={lyrics}
          onChange={e => setLyrics(e.target.value)}
          onBlur={saveText}
          disabled={!editable}
        />
      </div>
    </div>
  )
}
