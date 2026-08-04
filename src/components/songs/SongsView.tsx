'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { stageLabel, stageBadgeClass } from '@/lib/utils'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import type { Stage } from '@/types'

export function SongsView() {
  const client = useStore(s => s.getClient())
  const { advanceTrack, deleteTrack, addTrack } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newStage, setNewStage] = useState<Stage>('track')

  if (!client) return null
  const album  = client.songs.albums[0]
  const tracks = album.tracks
  const done   = tracks.filter(t => t.stage === 'done').length
  const inProd = tracks.filter(t => ['mix', 'master'].includes(t.stage)).length
  const stages: Stage[] = ['track', 'mix', 'master', 'done']

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
          <div className="text-sm text-gray-400 mt-1">{tracks.length} tracks · {done} done · {inProd} in mix/master</div>
          <button
            onClick={() => setAddOpen(true)}
            className="mt-2 px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
          >
            + New track
          </button>
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

      {/* Track table */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {['#','Title','Stage','Ver','Touched',''].map(h => (
              <th key={h} className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2.5 py-1.5 border-b border-gray-100">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tracks.map(t => {
            const idx = stages.indexOf(t.stage)
            return (
              <tr key={t.id} className="group hover:bg-gray-50 transition-colors">
                <td className="px-2.5 py-2.5 text-xs text-gray-400">{String(t.num).padStart(2, '0')}</td>
                <td className="px-2.5 py-2.5 font-medium">{t.title}</td>
                <td className="px-2.5 py-2.5">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${stageBadgeClass(t.stage)}`}>
                    {stageLabel(t.stage)}
                  </span>
                </td>
                <td className="px-2.5 py-2.5 text-xs text-gray-400">{t.version}</td>
                <td className="px-2.5 py-2.5 text-xs text-gray-400">{t.touched}</td>
                <td className="px-2.5 py-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex gap-1.5">
                    {idx < stages.length - 1 && (
                      <button
                        onClick={() => advanceTrack(t.id)}
                        className="px-2 py-0.5 border border-gray-200 rounded text-[11px] font-medium hover:bg-gray-100 transition-colors"
                      >
                        → {stageLabel(stages[idx + 1])}
                      </button>
                    )}
                    <button
                      onClick={() => { if (confirm(`Delete "${t.title}"?`)) deleteTrack(t.id) }}
                      className="px-2 py-0.5 border border-gray-200 rounded text-[11px] text-red-400 hover:bg-red-50 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
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
    </div>
  )
}
