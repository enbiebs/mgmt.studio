// ──────────────────────────────────────────────────────────
//  First-day steps for a NEW COMPANY: what an owner still has to do before the app is useful to their team. Like the
//  per-artist checklist, nothing is stored as "done": each step looks at the real data and ticks itself the moment the
//  thing exists, however it got there. Pure logic (no screen, no database), so it can be tested.
// ──────────────────────────────────────────────────────────

export interface CompanyStep {
  key: 'artist' | 'team' | 'access'
  title: string
  hint: string
  /** The button label. */
  action: string
  done: boolean
}

export interface CompanySetupContext {
  /** Real artists in the company (the demo artist does not count). */
  artistCount: number
  /** Everyone with a login who is not a manager or an artist, with what they can open. */
  teammates: { allClients: boolean; artistCount: number }[]
}

export function companySteps(ctx: CompanySetupContext): CompanyStep[] {
  const team = ctx.teammates.length
  return [
    {
      key: 'artist', title: 'Add your first artist',
      hint: 'Shows, money, contracts and music all hang off an artist, so start there.',
      action: 'Add an artist', done: ctx.artistCount > 0,
    },
    {
      key: 'team', title: 'Invite your team',
      hint: 'Type their email and choose what they can open. It is set up before they even accept.',
      action: 'Invite someone', done: team > 0,
    },
    {
      key: 'access', title: 'Choose who can open which artist',
      hint: team === 0 ? 'Once someone is on the team, pick their role for each artist on the Company page.' : 'Some people cannot open any artist yet. Pick a role for each of them on the Company page.',
      action: 'Open the Company page',
      done: team > 0 && ctx.teammates.every(t => t.allClients || t.artistCount > 0),
    },
  ]
}

/** True when every step is done (the card then goes away on its own). */
export const companySetupDone = (steps: CompanyStep[]) => steps.every(s => s.done)
