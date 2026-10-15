'use client'
import { useStore } from '@/lib/store'
import { progressForShow, STEPS, type ProgressStep } from '@/lib/show-progress'
import { today } from '@/lib/utils'
import { Icon } from '@/components/ui/Icon'
import type { Show } from '@/types'
import { goShowStep } from './progressNav'

const STEP_CAPTION: Record<ProgressStep['state'], string> = { done: 'Done', now: 'Now', next: 'Next', open: 'Optional' }
const STEP_STYLE: Record<ProgressStep['state'], string> = {
  done: 'border-gray-800 text-gray-600',
  now:  'border-accent text-gray-900',
  next: 'border-gray-200 text-gray-400',
  open: 'border-gray-100 text-gray-400',
}
const TONE_DOT = { ok: 'bg-green-500', todo: 'bg-amber-500', quiet: 'bg-gray-300' } as const

/** A show followed from offer to paid: where it stands, the one thing to do next, and the state of each part. */
export function ShowProgressPanel({ show }: { show: Show }) {
  const client = useStore(s => s.getClient())
  const canSeeMoney = useStore(s => s.hasAccess('finance'))
  if (!client || show.historyOnly) return null

  const progress = progressForShow(client, show, today())
  const facts = progress.facts.filter(f => canSeeMoney || !f.money)
  const allDone = progress.current === STEPS.length && !progress.cancelled

  return (
    <div className="mb-6 space-y-4">
      <ol className="grid grid-cols-4 md:grid-cols-7 gap-x-1.5 gap-y-3" aria-label="Progress">
        {progress.steps.map(s => (
          <li key={s.key} aria-current={s.state === 'now' ? 'step' : undefined} className={`border-t-[3px] pt-2 transition-colors ${STEP_STYLE[s.state]}`}>
            <div className="font-mono text-[10px] uppercase tracking-wider text-gray-400">{STEP_CAPTION[s.state]}</div>
            <div className="text-[13px] font-medium">{s.label}</div>
          </li>
        ))}
      </ol>

      {progress.next ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3">
          <div className="min-w-0 flex-1 basis-48">
            <div className="text-[10px] font-bold uppercase tracking-widest text-accent">Next step</div>
            <div className="font-medium">{progress.next.label}</div>
            {progress.next.detail && <div className="text-xs text-gray-600">{progress.next.detail}</div>}
          </div>
          <button
            onClick={() => goShowStep(show.id, progress.next!.go)}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
          >
            Do it <Icon name="arrow" className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className={`rounded-xl px-4 py-3 text-sm ${allDone ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
          {allDone ? 'All done. This show has been played and paid.' : progress.waiting ? `Nothing to do right now. ${progress.waiting}.` : 'Nothing to do right now.'}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {facts.map(f => (
          <button
            key={f.key}
            onClick={() => goShowStep(show.id, f.go)}
            className="rounded-xl border border-gray-100 px-3 py-2 text-left transition-colors hover:border-gray-200 hover:bg-gray-50"
          >
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{f.label}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
              <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${TONE_DOT[f.tone]}`} />
              <span className="truncate">{f.value}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
