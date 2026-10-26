// ──────────────────────────────────────────────────────────
//  The steps along the top of a show's page: Details, Advance, Travel, Guests, Day sheet, Money. Each is a button to that part
//  of the show, with a small dot for where it stands (done, to do, or nothing to say). A step shows only when this person can
//  open the screen behind it. Money is the one that leaves the show's page: budgets and settlements live on the Money tab.
//  Pure logic (no store, no screen), covered by scripts/check-show-steps.ts.
// ──────────────────────────────────────────────────────────

import type { Show } from '@/types'
import type { ShowProgress } from '@/lib/show-progress'
import { defaultShow, type DatedShow } from '@/lib/date-state'

export type StepTone = 'ok' | 'todo' | 'quiet' | 'none'
export type ShowStepKey = 'tour' | 'advance' | 'travel' | 'guests' | 'daysheet' | 'money'

export interface ShowStep {
  key: ShowStepKey
  label: string
  /** The Tour screen the step opens (Money opens the budget). */
  sub: 'tour' | 'advance' | 'travel' | 'guests' | 'daysheet' | 'budget' | 'settlements'
  tone: StepTone
  /** A word or two for the dot's tooltip. */
  note?: string
  /** Opens a screen outside this show's page. */
  leaves?: boolean
}

const STEPS: { key: ShowStepKey; label: string; sub: ShowStep['sub']; needs: readonly string[]; leaves?: boolean }[] = [
  { key: 'tour',     label: 'Details',   sub: 'tour',     needs: ['tour'] },
  { key: 'advance',  label: 'Advance',   sub: 'advance',  needs: ['advance'] },
  { key: 'travel',   label: 'Travel',    sub: 'travel',   needs: ['travel'] },
  { key: 'guests',   label: 'Guests',    sub: 'guests',   needs: ['guests'] },
  { key: 'daysheet', label: 'Day sheet', sub: 'daysheet', needs: ['daysheet'] },
  { key: 'money',    label: 'Money',     sub: 'budget',   needs: ['budget', 'settlements'], leaves: true },
]

/** `tabs` are the Tour screens this person can open (see visibleTourTabs). */
export function showSteps(progress: ShowProgress, show: Pick<Show, 'status'>, tabs: readonly string[]): ShowStep[] {
  const fact = (key: string) => progress.facts.find(f => f.key === key)
  const tone = (key: string): { tone: StepTone; note?: string } => { const f = fact(key); return f ? { tone: f.tone, note: f.value } : { tone: 'none' } }
  const toneOf = (key: ShowStepKey): { tone: StepTone; note?: string } => {
    switch (key) {
      case 'tour': return show.status === 'confirmed' ? { tone: 'ok', note: 'Confirmed' } : show.status === 'hold' ? { tone: 'todo', note: 'Still a hold' } : { tone: 'quiet', note: 'Cancelled' }
      case 'advance': return tone('advance')
      case 'travel': return tone('travel')
      case 'guests': return tone('guests')
      case 'daysheet': return { tone: 'none' }
      case 'money': {
        const settlement = fact('settlement'), invoice = fact('invoice'), budget = fact('budget')
        if (settlement?.tone === 'ok') return { tone: 'ok', note: settlement.value }
        const open = [settlement, invoice].find(f => f?.tone === 'todo')
        if (open) return { tone: 'todo', note: open.value }
        return { tone: 'quiet', note: budget?.value }
      }
    }
  }
  return STEPS
    .filter(s => s.needs.some(n => tabs.includes(n)))
    // Money opens Budgets, or Settlements for someone who may open only those.
    .map(s => ({ key: s.key, label: s.label, sub: s.key === 'money' && !tabs.includes('budget') ? 'settlements' as const : s.sub, ...toneOf(s.key), ...(s.leaves ? { leaves: true } : {}) }))
}

/**
 * The show whose steps are on screen: the one picked (a show kept only as history has no steps, so none), or, on one of the
 * step screens with nothing valid picked (an old link, or arriving from another tab), the show that is next. It only decides
 * what to show: it never changes the pick, so going back to the summary really goes back.
 */
export function stepsShowFor<T extends DatedShow>(shows: readonly T[], pickedId: string | null, onStepScreen: boolean, today: string): T | undefined {
  const picked = shows.find(s => s.id === pickedId)
  if (picked) return picked.historyOnly ? undefined : picked
  return onStepScreen ? defaultShow(shows.filter(s => !s.historyOnly), today) : undefined
}
