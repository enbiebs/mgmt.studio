'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import type { Track, TrackLabelCopy } from '@/types'

export function LabelCopyView() {
  const client = useStore(s => s.getClient())
  const { updateAlbumLabelCopy, updateTrackLabelCopy } = useStore()
  const [editTrack, setEditTrack] = useState<Track | null>(null)

  if (!client) return null
  const album = client.songs.albums[0]
  const lc = album.labelCopy ?? {}

  const missing = album.tracks.filter(t => !t.labelCopy?.isrc).length

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-serif text-2xl font-medium">{album.title}</div>
          <div className="text-sm text-gray-400 mt-1">
            Label copy · {album.tracks.length - missing} of {album.tracks.length} tracks have an ISRC
          </div>
        </div>
      </div>

      {/* Release-level metadata */}
      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Release info</div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="UPC / Barcode">
            <input className={inputClass} placeholder="Not assigned"
              value={lc.upc ?? ''} onChange={e => updateAlbumLabelCopy(album.id, { upc: e.target.value })} />
          </FormField>
          <FormField label="Label">
            <input className={inputClass} placeholder="e.g. Independent"
              value={lc.label ?? ''} onChange={e => updateAlbumLabelCopy(album.id, { label: e.target.value })} />
          </FormField>
          <FormField label="Primary artist">
            <input className={inputClass} placeholder={client.name}
              value={lc.primaryArtist ?? ''} onChange={e => updateAlbumLabelCopy(album.id, { primaryArtist: e.target.value })} />
          </FormField>
          <FormField label="Genre">
            <input className={inputClass} placeholder={client.genre}
              value={lc.genre ?? ''} onChange={e => updateAlbumLabelCopy(album.id, { genre: e.target.value })} />
          </FormField>
          <FormField label="℗ line">
            <input className={inputClass} placeholder={`℗ ${new Date().getFullYear()} …`}
              value={lc.copyrightP ?? ''} onChange={e => updateAlbumLabelCopy(album.id, { copyrightP: e.target.value })} />
          </FormField>
          <FormField label="© line">
            <input className={inputClass} placeholder={`© ${new Date().getFullYear()} …`}
              value={lc.copyrightC ?? ''} onChange={e => updateAlbumLabelCopy(album.id, { copyrightC: e.target.value })} />
          </FormField>
        </div>
      </div>

      {/* Per-track label copy */}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {['#', 'Title', 'ISRC', 'Writers', 'Explicit', 'Dur.', ''].map(h => (
              <th key={h} className="text-left text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2.5 py-1.5 border-b border-gray-100">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {album.tracks.map(t => (
            <tr key={t.id} className="group hover:bg-gray-50 transition-colors">
              <td className="px-2.5 py-2.5 text-xs text-gray-400">{String(t.num).padStart(2, '0')}</td>
              <td className="px-2.5 py-2.5 font-medium">{t.title}</td>
              <td className="px-2.5 py-2.5 text-xs text-gray-500">{t.labelCopy?.isrc || <span className="text-red-400">missing</span>}</td>
              <td className="px-2.5 py-2.5 text-xs text-gray-400">{t.labelCopy?.writers || '—'}</td>
              <td className="px-2.5 py-2.5 text-xs text-gray-400">{t.labelCopy?.explicit ? 'E' : '—'}</td>
              <td className="px-2.5 py-2.5 text-xs text-gray-400">{t.labelCopy?.duration || '—'}</td>
              <td className="px-2.5 py-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => setEditTrack(t)}
                  className="px-2 py-0.5 border border-gray-200 rounded text-[11px] font-medium hover:bg-gray-100 transition-colors"
                >
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editTrack && (
        <TrackLabelCopyModal
          track={editTrack}
          onClose={() => setEditTrack(null)}
          onSave={patch => { updateTrackLabelCopy(editTrack.id, patch); setEditTrack(null) }}
        />
      )}
    </div>
  )
}

function TrackLabelCopyModal({ track, onClose, onSave }: {
  track: Track
  onClose: () => void
  onSave: (patch: TrackLabelCopy) => void
}) {
  const [form, setForm] = useState<TrackLabelCopy>({ ...track.labelCopy })
  const set = <K extends keyof TrackLabelCopy>(key: K, value: TrackLabelCopy[K]) =>
    setForm(f => ({ ...f, [key]: value }))

  return (
    <Modal title={`Label copy · ${track.title}`} onClose={onClose} footer={
      <>
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
        <button onClick={() => onSave(form)} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Save</button>
      </>
    }>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="ISRC">
          <input className={inputClass} placeholder="US-XXX-26-00001" value={form.isrc ?? ''} onChange={e => set('isrc', e.target.value)} autoFocus />
        </FormField>
        <FormField label="Duration">
          <input className={inputClass} placeholder="3:24" value={form.duration ?? ''} onChange={e => set('duration', e.target.value)} />
        </FormField>
        <FormField label="Writers">
          <input className={inputClass} placeholder="Songwriter credits" value={form.writers ?? ''} onChange={e => set('writers', e.target.value)} />
        </FormField>
        <FormField label="Producers">
          <input className={inputClass} placeholder="Producer credits" value={form.producers ?? ''} onChange={e => set('producers', e.target.value)} />
        </FormField>
        <FormField label="Publisher">
          <input className={inputClass} value={form.publisher ?? ''} onChange={e => set('publisher', e.target.value)} />
        </FormField>
        <FormField label="PRO">
          <input className={inputClass} placeholder="ASCAP / BMI / PRS" value={form.pro ?? ''} onChange={e => set('pro', e.target.value)} />
        </FormField>
        <FormField label="Language">
          <input className={inputClass} placeholder="English" value={form.language ?? ''} onChange={e => set('language', e.target.value)} />
        </FormField>
        <FormField label="Explicit">
          <label className="flex items-center gap-2 h-[38px] text-sm">
            <input type="checkbox" checked={!!form.explicit} onChange={e => set('explicit', e.target.checked)} />
            Contains explicit content
          </label>
        </FormField>
      </div>
    </Modal>
  )
}
