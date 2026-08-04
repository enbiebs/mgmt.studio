'use client'
import { useStore } from '@/lib/store'
import { defaultChecklist } from '@/lib/utils'
import type { ChecklistPhase } from '@/types'

const PHASE_ORDER: ChecklistPhase[] = ['Rights & Credits', 'Audio Delivery', 'Release Assets', 'Social & DSP Marketing']

export function ChecklistView() {
  const client = useStore(s => s.getClient())
  const { toggleChecklistItem, updateChecklistNote } = useStore()

  if (!client) return null
  const album = client.songs.albums[0]
  const items = album.checklist && album.checklist.length ? album.checklist : defaultChecklist()
  const done = items.filter(i => i.done).length
  const pct = Math.round((done / items.length) * 100)

  return (
    <div className="flex-1 overflow-auto p-6 max-w-2xl">
      <div className="mb-5">
        <div className="font-serif text-2xl font-medium">{album.title}</div>
        <div className="text-sm text-gray-400 mt-1">Release checklist · {done} of {items.length} complete</div>
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
                    className="mt-0.5 w-4 h-4 flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium ${item.done ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {item.label}
                    </div>
                    <input
                      className="w-full mt-1 text-xs text-gray-400 outline-none bg-transparent placeholder:text-gray-300"
                      placeholder="Add a note…"
                      defaultValue={item.note ?? ''}
                      onBlur={e => updateChecklistNote(album.id, item.key, e.target.value)}
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
