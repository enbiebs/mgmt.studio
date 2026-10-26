// ──────────────────────────────────────────────────────────
//  First-day checklist — what a newly added artist still needs before the app is useful.
//
//  Nothing here is stored as "done": every step looks at the artist's real data, so it ticks
//  itself off the moment the thing exists (however it got there - typed, imported, pasted).
//  The only thing stored is a step the team marked "doesn't apply to this artist".
// ──────────────────────────────────────────────────────────

import type { Client, MainSection } from '@/types'

export interface SetupStep {
  key: string
  title: string
  hint: string
  action: string                                 // the button label, e.g. "Import shows"
  go: { section: MainSection; tourSub?: 'tour' | 'offers' | 'budget' | 'crew' }
  done: boolean
  skipped: boolean
}

export interface SetupContext {
  /** True when this artist already has their own login (or a pending invite) in the workspace. */
  artistHasLogin: boolean
}

export function setupSteps(client: Client, ctx: SetupContext): SetupStep[] {
  const skipped = new Set(client.setupSkipped ?? [])
  const step = (s: Omit<SetupStep, 'skipped'>): SetupStep => ({ ...s, skipped: skipped.has(s.key) })
  return [
    step({
      key: 'shows', title: 'Put their shows on the calendar',
      hint: 'Use + New gig to add them one at a time, or add many from a spreadsheet of dates.',
      action: 'Add shows', go: { section: 'tour', tourSub: 'tour' },
      done: client.tour.shows.length > 0,
    }),
    step({
      key: 'offers', title: 'Add any offers you are working on',
      hint: 'Use + New gig, then paste an offer email and the form fills itself in.',
      action: 'Add an offer', go: { section: 'tour', tourSub: 'offers' },
      done: client.agentData.offers.length > 0,
    }),
    step({
      key: 'crew', title: 'Add the people who travel with them',
      hint: 'Tour manager, sound, lights, anyone who gets paid per show.',
      action: 'Add crew', go: { section: 'tour', tourSub: 'crew' },
      done: client.tour.crew.length > 0,
    }),
    step({
      key: 'rates', title: 'Save what each crew member is paid',
      hint: 'Saved rates fill in every new budget for you.',
      action: 'Open budgets', go: { section: 'tour', tourSub: 'budget' },
      done: client.finance.crewRates.length > 0,
    }),
    step({
      key: 'music', title: 'Add their songs',
      hint: 'Releases and tracks, so the music side can be tracked.',
      action: 'Add music', go: { section: 'songs' },
      done: client.songs.albums.some(a => a.tracks.length > 0),
    }),
    step({
      key: 'contracts', title: 'Add the contracts you already have',
      hint: 'Recording, publishing, management - so deadlines and renewals are tracked.',
      action: 'Add contracts', go: { section: 'legal' },
      done: client.legal.contracts.length > 0,
    }),
    step({
      key: 'artist', title: 'Invite the artist to their own page',
      hint: 'They see their schedule and answer offer sheets. Add them under Team, then invite.',
      action: 'Open Team', go: { section: 'team' },
      done: ctx.artistHasLogin,
    }),
  ]
}

export function setupProgress(steps: SetupStep[]) {
  const done = steps.filter(s => s.done).length
  const open = steps.filter(s => !s.done && !s.skipped)
  return { done, total: steps.length, open, complete: open.length === 0 }
}
