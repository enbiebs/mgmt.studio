'use client'
// ──────────────────────────────────────────────────────────
//  CostAssignment — which show(s), whole run, or nothing an expense counts
//  against, and which budget line it belongs to. Specific shows split the cost
//  evenly; a whole run shares it evenly across that run's shows.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { selectClass } from '@/components/ui/Modal'
import { BUCKET_LABEL, PRODUCTION_BUCKETS } from '@/lib/budget'
import type { BudgetBucket } from '@/types'

export interface CostAssignmentValue { showIds: string[]; runId?: string; bucket?: BudgetBucket }

type Mode = 'none' | 'shows' | 'run'
// "Specific show(s)" with nothing ticked yet looks the same as "none" in the data, so the
// component remembers that the picker was asked for (pickingShows).
const modeOf = (v: CostAssignmentValue, pickingShows: boolean): Mode =>
  v.showIds.length > 0 ? 'shows' : v.runId ? 'run' : pickingShows ? 'shows' : 'none'

const SOUND_AND_PRODUCTION: BudgetBucket[] = ['sound_lights', ...PRODUCTION_BUCKETS]

export function CostAssignment({ value, onChange }: { value: CostAssignmentValue; onChange: (v: CostAssignmentValue) => void }) {
  const client = useStore(s => s.getClient())
  const shows = [...(client?.tour.shows ?? [])].sort((a, b) => a.date.localeCompare(b.date))
  const runs = client?.tour.runs ?? []
  const [pickingShows, setPickingShows] = useState(false)
  const mode = modeOf(value, pickingShows)

  function setMode(m: Mode) {
    setPickingShows(m === 'shows')
    if (m === 'none') onChange({ ...value, showIds: [], runId: undefined })
    else if (m === 'shows') onChange({ ...value, runId: undefined })
    else onChange({ ...value, showIds: [], runId: value.runId ?? runs[0]?.id })
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <select className={`${selectClass} !w-auto !py-1`} value={mode} onChange={e => setMode(e.target.value as Mode)}>
          <option value="none">No show (not counted against any show)</option>
          <option value="shows">Specific show(s)</option>
          <option value="run" disabled={runs.length === 0}>A whole run{runs.length === 0 ? ' (create a run first)' : ''}</option>
        </select>
        {mode === 'run' && (
          <select className={`${selectClass} !w-auto !py-1`} value={value.runId ?? ''} onChange={e => onChange({ ...value, runId: e.target.value })}>
            {runs.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
      </div>

      {mode === 'shows' && (
        <div className="border border-gray-100 rounded-lg max-h-32 overflow-auto p-1.5 space-y-0.5">
          {shows.length === 0 && <div className="text-xs text-gray-300 px-1">No shows yet</div>}
          {shows.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-xs px-1 py-0.5 hover:bg-gray-50 rounded cursor-pointer">
              <input
                type="checkbox" className="rounded" checked={value.showIds.includes(s.id)}
                onChange={e => onChange({ ...value, showIds: e.target.checked ? [...value.showIds, s.id] : value.showIds.filter(id => id !== s.id) })}
              />
              {s.venue} <span className="text-gray-400">· {s.city} · {s.date}</span>
            </label>
          ))}
        </div>
      )}
      {mode !== 'none' && value.showIds.length > 1 && <div className="text-[11px] text-gray-400">Split evenly across {value.showIds.length} shows.</div>}

      {mode !== 'none' && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Budget line</span>
          <select className={`${selectClass} !w-auto !py-1`} value={value.bucket ?? ''} onChange={e => onChange({ ...value, bucket: (e.target.value || undefined) as BudgetBucket | undefined })}>
            <option value="">Choose from the expense type</option>
            {SOUND_AND_PRODUCTION.map(b => <option key={b} value={b}>{BUCKET_LABEL[b]}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}
