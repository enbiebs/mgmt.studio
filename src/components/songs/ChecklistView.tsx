'use client'
import { useStore } from '@/lib/store'
import { defaultChecklist, resolveActiveAlbum, today } from '@/lib/utils'
import { planItems, type PlannedItem } from '@/lib/release-plan'
import { daysUntil } from '@/lib/date-state'
import { dateWord } from '@/lib/contract-dates'
import { ReleasePicker } from './ReleasePicker'
import type { ChecklistPhase } from '@/types'

const PHASE_ORDER: ChecklistPhase[] = ['Rights & Credits', 'Audio Delivery', 'Release Assets', 'Social & DSP Marketing']

/** "Due Oct 16, 2026 · in 3 days" / "Due Oct 16, 2026 · 10 days late": nothing for a finished step, or a release with no date or one that is already out. */
function DueTag({ p }: { p?: PlannedItem }) {
  if (!p || p.item.done || p.due === null || p.daysLeft === null) return null
  const n = Math.abs(p.daysLeft)
  const when = p.daysLeft === 0 ? 'today' : p.daysLeft > 0 ? `in ${n} day${n === 1 ? '' : 's'}` : `${n} day${n === 1 ? '' : 's'} late`
  return <span className={`mt-0.5 block text-[11px] ${p.late ? 'font-medium text-red-600' : 'text-gray-400'}`}>Due {dateWord(p.due)} · {when}</span>
}

export function ChecklistView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('songs'))
  const selectedAlbumId = useStore(s => s.selectedAlbumId)
  const { toggleChecklistItem, updateChecklistNote } = useStore()

  if (!client) return null
  const albums = client.songs.albums
  const album = resolveActiveAlbum(albums, selectedAlbumId)
  const items = album.checklist && album.checklist.length ? album.checklist : defaultChecklist()
  const done = items.filter(i => i.done).length
  const pct = Math.round((done / items.length) * 100)
  const day = today()
  const toGo = album.releaseDate ? daysUntil(album.releaseDate, day) : null
  const comingUp = toGo !== null && toGo >= 0                  // once a release is out, "late" means nothing any more
  const plan = new Map(planItems(items, comingUp ? album.releaseDate : undefined, day).map(p => [p.item.key, p]))
  const lateCount = [...plan.values()].filter(p => p.late).length

  return (
    <div className="flex-1 overflow-auto p-6 max-w-2xl">
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <div className="font-serif text-2xl font-medium">{album.title}</div>
          <ReleasePicker albums={albums} activeId={album.id} />
        </div>
        <div className="text-sm text-gray-400 mt-1">Release checklist · {done} of {items.length} complete</div>
        <div className="text-sm mt-0.5">
          {album.releaseDate ? (
            <span className="text-gray-500">
              {comingUp ? 'Out' : 'Came out'} {dateWord(album.releaseDate)}{comingUp ? ` · ${toGo === 0 ? 'today' : `${toGo} day${toGo === 1 ? '' : 's'} to go`}` : ''}
              {lateCount > 0 && <span className="font-medium text-red-600"> · {lateCount} step{lateCount === 1 ? '' : 's'} behind</span>}
            </span>
          ) : <span className="text-gray-400">No release date yet. Set it on the Label Copy tab and each step gets a due date.</span>}
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 mb-6">
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-gray-800 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {PHASE_ORDER.map(phase => {
        const phaseItems = items.filter(i => i.phase === phase)
        if (phaseItems.length === 0) return null
        const phaseDone = phaseItems.filter(i => i.done).length
        return (
          <div key={phase} className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{phase}</div>
              <div className="text-[11px] text-gray-300">{phaseDone}/{phaseItems.length}</div>
            </div>
            <div className="flex flex-col gap-2">
              {phaseItems.map(item => (
                <div key={item.key} className="border border-gray-100 rounded-xl px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => toggleChecklistItem(album.id, item.key)}
                    disabled={!editable}
                    className="mt-0.5 w-4 h-4 flex-shrink-0 disabled:cursor-not-allowed"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${item.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {item.label}
                    </div>
                    <DueTag p={plan.get(item.key)} />
                    <input
                      className="w-full mt-1 text-xs text-gray-400 outline-none bg-transparent placeholder:text-gray-300 disabled:cursor-not-allowed"
                      placeholder="Add a note…"
                      defaultValue={item.note ?? ''}
                      onBlur={e => updateChecklistNote(album.id, item.key, e.target.value)}
                      disabled={!editable}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
