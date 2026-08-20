'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { stageLabel, stageBadgeClass, isStale } from '@/lib/utils'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import type { Stage, Track, TrackPriority } from '@/types'

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

const STAGES: Stage[] = ['track', 'mix', 'master', 'done']

export function SongsView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('songs'))
  const { advanceTrack, deleteTrack, addTrack } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newStage, setNewStage] = useState<Stage>('track')
  const [filter, setFilter] = useState<Stage | 'all'>('all')
  const [detailTrack, setDetailTrack] = useState<Track | null>(null)

  if (!client) return null
  const album  = client.songs.albums[0]
  const tracks = album.tracks
  const done   = tracks.filter(t => t.stage === 'done').length
  const inProd = tracks.filter(t => ['mix', 'master'].includes(t.stage)).length
  const stalled = tracks.filter(t => isStale(t.stage, t.touched)).length

  const visible = filter === 'all' ? tracks : tracks.filter(t => t.stage === filter)

  function handleAdd() {
    if (!newTitle.trim()) return
    addTrack(album.id, newTitle.trim(), newStage)
    setNewTitle(''); setNewStage('track'); setAddOpen(false)
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Album header */}
      <div className="flex items-start gap-4 mb-6">
        <div
          className="w-[76px] h-[76px] rounded-xl flex items-center justify-center text-white text-3xl flex-shrink-0"
          style={{ background: client.color }}
        >
          ♪
        </div>
        <div>
          <div className="font-serif text-2xl font-medium">{album.title}</div>
          <div className="text-sm text-gray-400 mt-1">
            {tracks.length} tracks · {done} done · {inProd} in mix/master
            {stalled > 0 && <span className="text-amber-500"> · {stalled} stalled 10d+</span>}
          </div>
          {editable && (
            <button
              onClick={() => setAddOpen(true)}
              className="mt-2 px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              + New track
            </button>
          )}
        </div>
      </div>

      {/* Progress pips */}
      <div className="bg-gray-50 rounded-xl p-4 mb-5">
        <div className="flex gap-1 mb-2">
          {tracks.map(t => (
            <div
              key={t.id}
              className={`flex-1 h-1.5 rounded-full ${
                t.stage === 'done'   ? 'bg-gray-800' :
                t.stage === 'master' ? 'bg-blue-400'  :
                t.stage === 'mix'    ? 'bg-purple-400' : 'bg-gray-200'
              }`}
            />
          ))}
        </div>
        <div className="flex gap-4 text-[11px] text-gray-400">
          {[['bg-gray-800','Done'],['bg-purple-400','Mix'],['bg-blue-400','Master'],['bg-gray-200','Track']].map(([bg, lbl]) => (
            <span key={lbl} className="flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-sm ${bg}`} />{lbl}
            </span>
          ))}
        </div>
      </div>

      {/* Stage filter chips */}
      <div className="flex gap-1.5 mb-3">
        {(['all', ...STAGES] as const).map(s => {
          const count = s === 'all' ? tracks.length : tracks.filter(t => t.stage === s).length
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
            return (
              <tr
                key={t.id}
                onClick={() => setDetailTrack(t)}
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
              <td colSpan={7} className="text-center text-sm text-gray-300 py-8">No tracks at this stage</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Add track modal */}
      {addOpen && (
        <Modal title="Add a track" onClose={() => setAddOpen(false)} footer={
          <>
            <button onClick={() => setAddOpen(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Add track</button>
          </>
        }>
          <FormField label="Title">
            <input className={inputClass} placeholder="Track title" value={newTitle} onChange={e => setNewTitle(e.target.value)} autoFocus />
          </FormField>
          <FormField label="Starting stage">
            <select className={selectClass} value={newStage} onChange={e => setNewStage(e.target.value as Stage)}>
              <option value="track">Track</option>
              <option value="mix">Mix</option>
              <option value="master">Master</option>
            </select>
          </FormField>
        </Modal>
      )}

      {detailTrack && (
        <TrackDetailModal
          track={tracks.find(t => t.id === detailTrack.id) ?? detailTrack}
          onClose={() => setDetailTrack(null)}
        />
      )}
    </div>
  )
}

function TrackDetailModal({ track, onClose }: { track: Track; onClose: () => void }) {
  const editable = useStore(s => s.canEdit('songs'))
  const { updateTrackDetails } = useStore()
  const [title, setTitle] = useState(track.title)
  const [stage, setStage] = useState<Stage>(track.stage)
  const [priority, setPriority] = useState<TrackPriority>(track.priority ?? 'album-cut')
  const [owner, setOwner] = useState(track.owner ?? '')
  const [dueDate, setDueDate] = useState(track.dueDate ?? '')
  const [notes, setNotes] = useState(track.notes ?? '')

  function handleSave() {
    if (!title.trim()) return
    updateTrackDetails(track.id, {
      title: title.trim(), stage, priority,
      owner: owner.trim() || undefined,
      dueDate: dueDate || undefined,
      notes: notes.trim() || undefined,
    })
    onClose()
  }

  const lc = track.labelCopy

  return (
    <Modal title={`Track · ${track.title}`} onClose={onClose} footer={
      editable ? (
        <>
          <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Save</button>
        </>
      ) : (
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>
      )
    }>
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
      <FormField label="Due date">
        <input type="date" className={inputClass} value={dueDate} onChange={e => setDueDate(e.target.value)} disabled={!editable} />
      </FormField>
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
    </Modal>
  )
}
