'use client'
// ──────────────────────────────────────────────────────────
//  ShowStepBar — the steps along the top of one show: Details, Advance, Travel, Guests, Day sheet, Money. Each is a button to that
//  part of the show, with a dot for where it stands. On every step but Details, the next thing to do sits at the right (Details has
//  its own bigger "Next step" box). Which steps show, and each dot, are decided in lib/show-steps.ts.
// ──────────────────────────────────────────────────────────

import { useStore } from '@/lib/store'
import { progressForShow } from '@/lib/show-progress'
import { showSteps, type StepTone } from '@/lib/show-steps'
import { effectiveSub } from '@/lib/item-access'
import { today } from '@/lib/utils'
import { useTourTabs } from './useTourTabs'
import { goShowStep } from './progressNav'
import type { Show } from '@/types'

const DOT: Record<StepTone, string> = { ok: 'bg-green-500', todo: 'bg-amber-500', quiet: 'bg-gray-300', none: '' }

export function ShowStepBar({ show }: { show: Show }) {
  const client = useStore(s => s.getClient())
  const rawTourSub = useStore(s => s.tourSub)
  const { setTourSub, setSelectedBudget } = useStore()
  const tabs = useTourTabs()
  const tourSub = effectiveSub(rawTourSub, tabs)
  if (!client) return null

  const progress = progressForShow(client, show, today())
  const steps = showSteps(progress, show, tabs)
  if (steps.length === 0) return null
  const next = progress.next
  const here = next?.go.section === 'tour' && next.go.sub === tourSub

  function open(step: (typeof steps)[number]) {
    if (step.key === 'money') {
      // Budgets and settlements live on the Money tab: open this show's budget there (or the list, where one can be made).
      const budgets = client!.finance.budgets ?? []
      setSelectedBudget((budgets.find(b => b.showId === show.id) ?? budgets.find(b => !!show.tourOfferId && b.offerId === show.tourOfferId))?.id ?? null)
    }
    setTourSub(step.sub)
  }

  // The next thing to do, beside the steps on a wide screen and on a row of its own on a phone (Details has its own bigger box).
  const nextChip = (wide: boolean) => {
    if (tourSub === 'tour' || !next) return null
    const base = wide ? 'hidden flex-shrink-0 sm:block' : 'block w-full text-left sm:hidden'
    return here ? (
      <span className={`${wide ? 'hidden flex-shrink-0 truncate sm:inline' : 'block sm:hidden'} text-xs text-gray-600`}><span className="font-semibold text-accent">Next:</span> {next.label}</span>
    ) : (
      <button
        onClick={() => (next.action === 'confirm' ? setTourSub('tour') : goShowStep(show.id, next.go))}
        className={`${base} rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-accent-hover`}
      >
        Next: {next.label} →
      </button>
    )
  }

  return (
    <div className="flex-shrink-0 border-b border-gray-100 bg-gray-50/60">
      <div className="flex items-center gap-2 px-3 md:px-6">
        <nav aria-label="Steps for this show" className="flex flex-1 min-w-0 items-stretch gap-0.5 overflow-x-auto no-scrollbar">
          {steps.map(step => (
            <button
              key={step.key}
              onClick={() => open(step)}
              title={step.note}
              aria-current={tourSub === step.sub ? 'step' : undefined}
              className={`flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 -mb-px text-sm font-medium transition-colors ${
                tourSub === step.sub ? 'border-accent text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {step.tone !== 'none' && <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${DOT[step.tone]}`} aria-hidden />}
              {step.label}
              {step.leaves && <span className="text-gray-300" aria-hidden>↗</span>}
            </button>
          ))}
        </nav>
        {nextChip(true)}
      </div>
      {tourSub !== 'tour' && next && <div className="px-3 pb-2 sm:hidden">{nextChip(false)}</div>}
    </div>
  )
}
