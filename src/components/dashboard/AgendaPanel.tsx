'use client'
// ──────────────────────────────────────────────────────────
//  Agenda — the talking points / steps around ONE to-do or project: what to cover on the call, or the
//  steps to get it done. Tick them off as you go, paste a list to add several at once, or turn any point
//  into its own to-do. Private to the team: the artist never sees an agenda, even on their own request.
// ──────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { cleanPoint, pointsFor, progressOf, splitPoints } from '@/lib/agenda'
import type { AgendaItemType, AgendaPoint } from '@/types'

/** The points for one item and how far along they are (selects the stable list, then works the rest out, so it never re-renders in a loop). */
export function useAgenda(clientId: string, itemType: AgendaItemType, itemId: string): { points: AgendaPoint[]; done: number; total: number } {
  const agenda = useStore(s => s.data.clients.find(c => c.id === clientId)?.agenda)
  return useMemo(() => {
    const points = pointsFor({ agenda }, itemType, itemId)
    return { points, ...progressOf(points) }
  }, [agenda, itemType, itemId])
}

/** The small button that opens and closes the agenda: "Agenda" when empty, "Agenda · 2/5" once there are points. */
export function AgendaButton({ clientId, itemType, itemId, open, onToggle }: { clientId: string; itemType: AgendaItemType; itemId: string; open: boolean; onToggle: () => void }) {
  const { done, total } = useAgenda(clientId, itemType, itemId)
  return (
    <button
      type="button" onClick={onToggle} aria-expanded={open} title="Talking points and steps for this"
      className={`px-2 py-1 border rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
        open || total > 0 ? 'border-gray-300 text-gray-600 bg-gray-50 hover:bg-gray-100' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
      }`}
    >
      {total > 0 ? `Agenda · ${done}/${total}` : 'Agenda'}
    </button>
  )
}

export function AgendaPanel({ clientId, itemType, itemId, canEdit }: { clientId: string; itemType: AgendaItemType; itemId: string; canEdit: boolean }) {
  const { addAgendaPoints, toggleAgendaPoint, removeAgendaPoint, agendaPointToTodo } = useStore()
  const { points } = useAgenda(clientId, itemType, itemId)
  const [draft, setDraft] = useState('')

  function add() {
    const texts = splitPoints(draft)
    if (texts.length === 0) return
    addAgendaPoints(clientId, itemType, itemId, texts)
    setDraft('')
  }

  return (
    <div className="ml-1 mt-1 mb-2 border-l-2 border-gray-100 pl-3 py-1">
      {points.length === 0 && !canEdit && <div className="text-xs text-gray-400">No agenda yet.</div>}
      {points.map(p => (
        <div key={p.id} className="flex items-start gap-2 py-1 group">
          <button
            role="checkbox" aria-checked={p.done} aria-label={`${p.done ? 'Untick' : 'Tick off'} “${p.text}”`} disabled={!canEdit}
            onClick={() => toggleAgendaPoint(clientId, p.id)}
            className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center text-[9px] flex-shrink-0 transition-colors disabled:cursor-default ${p.done ? 'bg-gray-300 border-gray-300 text-white' : 'border-gray-300 hover:border-accent'}`}
          >
            {p.done ? '✓' : ''}
          </button>
          <span className={`flex-1 min-w-0 text-sm break-words ${p.done ? 'text-gray-400 line-through decoration-gray-300' : ''}`}>{p.text}</span>
          {canEdit && (
            <span className="flex items-center gap-1 flex-shrink-0 opacity-60 group-hover:opacity-100 focus-within:opacity-100">
              {!p.done && <button onClick={() => agendaPointToTodo(clientId, p.id)} title="Make this its own to-do" className="px-1.5 py-0.5 text-[11px] text-accent hover:underline">To-do</button>}
              <button onClick={() => removeAgendaPoint(clientId, p.id)} aria-label={`Remove “${p.text}”`} title="Remove" className="px-1 text-sm leading-none text-gray-300 hover:text-red-500">×</button>
            </span>
          )}
        </div>
      ))}
      {canEdit && (
        <input
          value={draft} maxLength={4000} aria-label="Add an agenda point"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          onPaste={e => {
            const text = e.clipboardData.getData('text')
            if (!text.includes('\n')) return                      // one line: let it paste normally
            e.preventDefault()
            const texts = splitPoints(text)
            if (texts.length) addAgendaPoints(clientId, itemType, itemId, texts)
          }}
          placeholder={points.length === 0 ? 'Add a point, or paste a list to add several' : 'Add another point'}
          className="mt-1 w-full px-2 py-1 text-sm bg-transparent border border-transparent rounded-lg hover:border-gray-100 focus:border-gray-200 outline-none placeholder:text-gray-400"
        />
      )}
      {points.length > 0 && cleanPoint(draft) === '' && <div className="mt-1 text-[10px] text-gray-300">Only your team sees the agenda, never the artist.</div>}
    </div>
  )
}
