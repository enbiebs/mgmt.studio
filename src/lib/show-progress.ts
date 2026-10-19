// ──────────────────────────────────────────────────────────
//  A show followed from offer to paid. Where it stands is worked out from the
//  records the app already has (advance, travel, settlement, invoice...), never stored, so it
//  can't drift out of date. This file decides:
//    - the seven steps and which one the show is on,
//    - the single "next step" worth doing,
//    - a short status line for each part of the show (advance, travel, money...).
//  Pure logic (no store, no screen), like inbox.ts.
// ──────────────────────────────────────────────────────────

import type { Client, Show, TourSub } from '@/types'
import { dayDiff } from '@/lib/intelligence'
import { balanceOf, money2 } from '@/lib/settlement-math'
import { settlementForShow } from '@/lib/budget'

export const STEPS = [
  { key: 'offer',      label: 'Offer' },
  { key: 'confirmed',  label: 'Confirmed' },
  { key: 'advance',    label: 'Advance' },
  { key: 'travel',     label: 'Travel' },
  { key: 'showday',    label: 'Show day' },
  { key: 'settlement', label: 'Settlement' },
  { key: 'paid',       label: 'Paid' },
] as const

export type StepKey = (typeof STEPS)[number]['key']
// 'open' = not started, but it does not hold the show up (travel when nothing has been added: a local show needs none).
export type StepState = 'done' | 'now' | 'next' | 'open'

/** Where a button takes you. */
export type ProgressLink = { section: 'tour'; sub: TourSub } | { section: 'finance'; sub: 'invoices' | 'payments' }

export interface ProgressStep { key: StepKey; label: string; state: StepState }
export interface NextStep { label: string; detail?: string; go: ProgressLink }
export interface ProgressFact {
  key: string
  label: string
  value: string
  tone: 'ok' | 'todo' | 'quiet'
  go: ProgressLink
  money?: boolean            // needs Finance access to be shown
}

export interface ShowProgress {
  cancelled: boolean
  lapsed: boolean            // a hold whose date has passed without it being confirmed
  steps: ProgressStep[]
  current: number            // index of the step the show is on; STEPS.length when everything is done
  next: NextStep | null
  waiting?: string           // when there is nothing to do yet ("Show day is in 41 days")
  facts: ProgressFact[]
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function progressForShow(client: Client, show: Show, today: string): ShowProgress {
  const advance = (client.tour.advances ?? []).find(a => a.showId === show.id)
  const travel = (client.tour.travel ?? []).filter(t => t.showIds?.includes(show.id) && t.status !== 'cancelled')
  const travelPending = travel.filter(t => t.status === 'needed' || t.status === 'pending')
  const guests = (client.tour.guestList ?? []).filter(g => g.showId === show.id)
  const guestsUsed = guests.reduce((n, g) => n + g.qty, 0)
  const guestCap = parseInt(advance?.guestListCap ?? '', 10)
  const budget = (client.finance.budgets ?? []).find(b => b.showId === show.id)
  const settlement = settlementForShow(client, show.id)
  const invoice = show.invoiceId ? client.finance.invoices.find(i => i.id === show.invoiceId) : undefined
  const away = dayDiff(show.date, today)             // days until the show; negative once it has happened
  const past = away < 0
  const lapsed = past && show.status === 'hold'      // a hold that was never confirmed before its date
  const owed = settlement ? balanceOf(settlement) : 0

  // ── Which steps are finished ────────────────────────────
  const done: Record<StepKey, boolean> = {
    offer: true,                                      // a show on the calendar already got past the offer
    confirmed: show.status === 'confirmed',
    advance: past || advance?.status === 'complete',   // once the show has happened there is nothing left to advance; the next step is the settlement
    travel: past || (travel.length > 0 && travelPending.length === 0),
    showday: past,
    settlement: !!settlement,
    paid: invoice?.status === 'paid' || (!!settlement && owed <= 0.005),
  }
  const open = (key: StepKey) => key === 'travel' && travel.length === 0 && !past

  let current: number = STEPS.length
  const steps: ProgressStep[] = STEPS.map((s, i) => {
    let state: StepState
    if (done[s.key]) state = 'done'
    else if (open(s.key)) state = 'open'
    else if (current === STEPS.length) { current = i; state = 'now' }
    else state = 'next'
    return { key: s.key, label: s.label, state }
  })

  // ── The one next thing ──────────────────────────────────
  let next: NextStep | null = null
  let waiting: string | undefined
  const stepKey = current < STEPS.length ? STEPS[current].key : null
  if (show.status === 'cancelled') {
    waiting = 'This show is cancelled'
  } else if (lapsed) {
    waiting = 'This hold passed without being confirmed'
  } else if (stepKey === 'confirmed') {
    next = { label: 'Confirm the hold', detail: 'It is still a hold. Confirm it when the promoter locks it in.', go: { section: 'tour', sub: 'tour' } }
  } else if (stepKey === 'advance') {
    next = !advance
      ? { label: 'Start the advance', detail: 'Schedule, production and hospitality for the venue', go: { section: 'tour', sub: 'advance' } }
      : advance.status === 'draft'
        ? { label: 'Finish and send the advance', go: { section: 'tour', sub: 'advance' } }
        : { label: 'Finish the advance', detail: 'It has been sent; fill in what comes back', go: { section: 'tour', sub: 'advance' } }
  } else if (stepKey === 'travel') {
    next = { label: `Book ${plural(travelPending.length, 'pending trip')}`, go: { section: 'tour', sub: 'travel' } }
  } else if (stepKey === 'showday') {
    if (away <= 7) next = { label: away === 0 ? 'Share the day sheet (show is today)' : 'Share the day sheet', go: { section: 'tour', sub: 'daysheet' } }
    else waiting = `Show day is in ${plural(away, 'day')}`
  } else if (stepKey === 'settlement') {
    next = { label: 'Add the settlement', detail: `The show was ${plural(-away, 'day')} ago`, go: { section: 'tour', sub: 'settlements' } }
  } else if (stepKey === 'paid') {
    next = invoice
      ? { label: invoice.status === 'draft' ? 'Send the invoice' : 'Chase the invoice', go: { section: 'finance', sub: 'invoices' } }
      : { label: 'Collect the balance', detail: settlement ? `${money2(owed, settlement.currency)} still owed` : undefined, go: { section: 'tour', sub: 'settlements' } }
  }

  // ── Where each part stands ──────────────────────────────
  const facts: ProgressFact[] = [
    {
      key: 'advance', label: 'Advance', go: { section: 'tour', sub: 'advance' },
      ...(advance?.status === 'complete' ? { value: 'Complete', tone: 'ok' as const }
        : past ? { value: 'Not completed', tone: 'quiet' as const }       // too late to matter now
        : advance ? { value: advance.status === 'draft' ? 'Draft' : 'In progress', tone: 'todo' as const }
        : { value: 'Not started', tone: 'todo' as const }),
    },
    {
      key: 'travel', label: 'Travel', go: { section: 'tour', sub: 'travel' },
      ...(travel.length === 0 ? { value: 'Nothing added', tone: 'quiet' as const }
        : travelPending.length > 0 ? { value: `${travelPending.length} to book`, tone: 'todo' as const }
        : { value: `${plural(travel.length, 'booking')}`, tone: 'ok' as const }),
    },
    {
      key: 'guests', label: 'Guest list', go: { section: 'tour', sub: 'guests' },
      value: guests.length === 0 ? 'Empty' : `${guestsUsed}${isNaN(guestCap) ? '' : ` of ${guestCap}`}`,
      tone: !isNaN(guestCap) && guestsUsed > guestCap ? 'todo' : guests.length === 0 ? 'quiet' : 'ok',
    },
    {
      key: 'budget', label: 'Budget', money: true, go: { section: 'tour', sub: 'budget' },
      ...(!budget ? { value: 'None yet', tone: 'quiet' as const }
        : budget.status === 'locked' ? { value: 'Locked', tone: 'ok' as const }
        : { value: 'Draft', tone: 'todo' as const }),
    },
    {
      key: 'settlement', label: 'Settlement', money: true, go: { section: 'tour', sub: 'settlements' },
      ...(!settlement ? (past ? { value: 'Not entered', tone: 'todo' as const } : { value: 'After the show', tone: 'quiet' as const })
        : owed > 0.005 ? { value: `${money2(owed, settlement.currency)} owed`, tone: 'todo' as const }
        : { value: 'Paid in full', tone: 'ok' as const }),
    },
    {
      key: 'invoice', label: 'Invoice', money: true, go: { section: 'finance', sub: 'invoices' },
      ...(!invoice ? { value: 'None', tone: 'quiet' as const }
        : invoice.status === 'paid' ? { value: 'Paid', tone: 'ok' as const }
        : { value: invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1), tone: invoice.status === 'overdue' ? 'todo' as const : 'quiet' as const }),
    },
  ]

  return { cancelled: show.status === 'cancelled', lapsed, steps, current, next, waiting, facts }
}
