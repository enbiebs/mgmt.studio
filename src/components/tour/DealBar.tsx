'use client'
import { useStore } from '@/lib/store'
import { dealForShow } from '@/lib/deal'
import { fromDateStr, today } from '@/lib/utils'
import { Icon } from '@/components/ui/Icon'
import { goDeal } from './dealNav'

/** A thin strip over the per-show screens (Advance, Day Sheet, Travel, Guests): which deal you are in, how far along it is, and what is next. */
export function DealBar() {
  const client = useStore(s => s.getClient())
  const showId = useStore(s => s.selectedShowId)
  const tourSub = useStore(s => s.tourSub)
  const setTourSub = useStore(s => s.setTourSub)
  const show = client?.tour.shows.find(s => s.id === showId)
  if (!client || !show || show.historyOnly) return null

  const deal = dealForShow(client, show, today())
  const next = deal.next
  const here = next?.go.section === 'tour' && next.go.sub === tourSub     // you are already on the screen the next step points to

  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-100 bg-gray-50 px-3 py-2 text-sm md:px-6">
      <button onClick={() => setTourSub('tour')} className="flex min-w-0 items-center gap-1.5 font-medium hover:text-accent" title="Back to this deal">
        <span aria-hidden>←</span>
        <span className="truncate">{show.venue} · {show.city}</span>
      </button>
      <span className="hidden flex-shrink-0 text-xs text-gray-400 sm:inline">
        {fromDateStr(show.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </span>

      <div className="hidden items-center gap-1 md:flex" aria-hidden>
        {deal.steps.map(s => (
          <span key={s.key} title={s.label} className={`h-1 w-5 rounded-full ${s.state === 'done' ? 'bg-gray-800' : s.state === 'now' ? 'bg-accent' : 'bg-gray-200'}`} />
        ))}
      </div>

      <div className="ml-auto flex min-w-0 items-center">
        {next ? (
          here ? (
            <span className="truncate text-gray-600"><span className="font-semibold text-accent">Next:</span> {next.label}</span>
          ) : (
            <button onClick={() => goDeal(show.id, next.go)} className="flex min-w-0 items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover">
              <span className="truncate">Next: {next.label}</span> <Icon name="arrow" className="h-3.5 w-3.5 flex-shrink-0" />
            </button>
          )
        ) : (
          <span className="truncate text-xs text-gray-500">{deal.waiting ?? 'Nothing to do right now'}</span>
        )}
      </div>
    </div>
  )
}
