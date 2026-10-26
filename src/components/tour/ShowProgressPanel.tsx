'use client'
import { useStore } from '@/lib/store'
import { progressForShow, STEPS } from '@/lib/show-progress'
import { today } from '@/lib/utils'
import { notify } from '@/lib/notify'
import { Icon } from '@/components/ui/Icon'
import type { Show } from '@/types'
import { goShowStep } from './progressNav'

/** The one thing to do next for a show (the steps along the top of the show carry where each part stands). */
export function ShowProgressPanel({ show }: { show: Show }) {
  const client = useStore(s => s.getClient())
  const canEditTour = useStore(s => s.canEdit('tour'))
  const updateShowStatus = useStore(s => s.updateShowStatus)
  if (!client || show.historyOnly) return null

  const progress = progressForShow(client, show, today())
  const allDone = progress.current === STEPS.length && !progress.cancelled

  return (
    <div className="mb-6 space-y-4">
      {progress.next ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-accent/25 bg-accent-soft px-4 py-3">
          <div className="min-w-0 flex-1 basis-48">
            <div className="text-[10px] font-bold uppercase tracking-widest text-accent">Next step</div>
            <div className="font-medium">{progress.next.label}</div>
            {progress.next.detail && <div className="text-xs text-gray-600">{progress.next.detail}</div>}
          </div>
          {progress.next.action === 'confirm' ? (
            // Confirming is the step itself, so the button does it (it used to link to this same page and change nothing).
            canEditTour ? (
              <button
                onClick={() => { updateShowStatus(show.id, 'confirmed'); notify(`${show.venue || show.city} is confirmed`, { label: 'Undo', run: () => updateShowStatus(show.id, 'hold') }) }}
                className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Confirm this show
              </button>
            ) : <span className="text-xs text-gray-500">Waiting for someone with Tour access</span>
          ) : (
            <button
              onClick={() => goShowStep(show.id, progress.next!.go)}
              className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
            >
              Do it <Icon name="arrow" className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <div className={`rounded-xl px-4 py-3 text-sm ${allDone ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
          {allDone ? 'All done. This show has been played and paid.' : progress.waiting ? `Nothing to do right now. ${progress.waiting}.` : 'Nothing to do right now.'}
        </div>
      )}
    </div>
  )
}
