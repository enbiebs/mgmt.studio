'use client'
import { useStore } from '@/lib/store'
import { RELEASE_TYPE_LABEL } from '@/lib/utils'
import type { Album } from '@/types'

// Label Copy / Checklist / Status each only make sense for one release at a
// time. This only renders once there's a second release to switch to — a
// client with just one keeps the exact look these screens always had.
export function ReleasePicker({ albums, activeId }: { albums: Album[]; activeId: string }) {
  const { setSelectedAlbum } = useStore()
  if (albums.length <= 1) return null

  return (
    <select
      className="text-sm font-medium border border-gray-200 rounded-lg pl-2.5 pr-7 py-1.5 bg-canvas outline-none focus:border-blue-400 transition-colors"
      value={activeId}
      onChange={e => setSelectedAlbum(e.target.value)}
    >
      {albums.map(a => (
        <option key={a.id} value={a.id}>{a.title} · {RELEASE_TYPE_LABEL[a.type ?? 'album']}</option>
      ))}
    </select>
  )
}
