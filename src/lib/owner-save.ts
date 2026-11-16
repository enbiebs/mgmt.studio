// ──────────────────────────────────────────────────────────
//  Saving owners. Who owns a show or an offer is saved on its own, after that row exists, and only when it was changed (see
//  setItemOwner in lib/db.ts). If the database refuses (for example the person lost access to the artist a moment ago), the old
//  owner is put back on screen and the person is told why: a change that did not save never stays on screen looking saved.
//
//  Three rules keep quick changes honest:
//   · an owner is written only after ITS OWN row has been saved (not after the rest of what a confirm saves, such as the budget);
//   · writes for one item go one after another, in the order they were made, so a slow earlier pick can never land after a later one;
//   · a refusal only puts the old owner back if the screen still shows the owner that was refused (a newer pick is left alone), and it puts
//     back the last owner that REALLY saved, not just the previous pick (two quick picks that both fail must end on what is saved).
//  Covered by scripts/check-item-owner.ts (the database and the message are passed in, so no network is needed).
// ──────────────────────────────────────────────────────────

import { setItemOwner } from '@/lib/db'
import { notify } from '@/lib/notify'

export interface OwnerWrite {
  table: 'shows' | 'tour_offers'
  id: string
  /** The owner to save (a login id), or undefined for nobody. */
  ownerId: string | undefined
  /** The owner this item had on screen just before this pick (taken to be what is saved, until a write says otherwise). */
  was: string | undefined
  /** Shows this owner on screen (used to put back the last owner that really saved when a save is refused). */
  restore: (ownerId: string | undefined) => void
  /** Whether the screen still shows the owner being saved. When something newer has been picked since, a refusal must not undo it. Omitted = yes. */
  stillShown?: () => boolean
}

/** What the person is told when an owner was not saved: the database's own words when they are plain ("That person cannot open this artist..."), otherwise a short generic line. */
export function ownerRefusalText(e: unknown): string {
  const m = e instanceof Error ? e.message : ''
  return /cannot open this artist/i.test(m) ? `The owner was not saved. ${m}.` : 'The owner was not saved. Please try again.'
}

// ── rows still being saved ──
const rowsSaving = new Map<string, Promise<unknown>>()

/** Remembers that this row is being saved, so an owner chosen a moment later waits for it (a show made by a confirm is not in the database for a few steps). */
export function trackRow(table: OwnerWrite['table'], id: string, saving: Promise<unknown>): void {
  const key = `${table}:${id}`
  rowsSaving.set(key, saving)
  const done = () => { if (rowsSaving.get(key) === saving) rowsSaving.delete(key) }
  saving.then(done, done)
}

/** The save of this row if one is under way, otherwise nothing to wait for. */
export function rowSaved(table: OwnerWrite['table'], id: string): Promise<unknown> {
  return rowsSaving.get(`${table}:${id}`) ?? Promise.resolve()
}

// ── writes, one after another for each item ──
const lastWrite = new Map<string, Promise<void>>()
/** For items with writes under way: the owner last known to be saved (what to show again when a write is refused). */
const knownSaved = new Map<string, string | undefined>()
type Deps = { write: typeof setItemOwner; tell: (text: string) => void }

async function attempt(w: OwnerWrite, deps: Deps): Promise<void> {
  const key = `${w.table}:${w.id}`
  try {
    await deps.write(w.table, w.id, w.ownerId ?? null)
    knownSaved.set(key, w.ownerId)
  } catch (e) {
    console.error(e)
    // A failure handler must never throw (it would skip the writes queued behind it and become an unhandled rejection).
    try {
      // Back to the owner that REALLY saved last, not to the previous pick (which may never have saved either).
      if (w.stillShown ? w.stillShown() : true) w.restore(knownSaved.has(key) ? knownSaved.get(key) : w.was)
      deps.tell(ownerRefusalText(e))
    } catch (inner) { console.error(inner) }
  }
}

/**
 * Joins the item's queue straight away (so writes keep the order they were picked in), then waits for the row's own save. If the row
 * did not save, nothing is attempted: that failure is reported where the row is saved, and a row that does not exist has no owner to write.
 */
function queued(w: OwnerWrite, deps: Deps, saved: Promise<unknown>): Promise<void> {
  const key = `${w.table}:${w.id}`
  if (!lastWrite.has(key)) knownSaved.set(key, w.was)       // the first pick since things were quiet: what was on screen is what is saved
  const next = (lastWrite.get(key) ?? Promise.resolve()).then(async () => {
    try { await saved } catch { return }
    await attempt(w, deps)
  })
  lastWrite.set(key, next)
  const done = () => { if (lastWrite.get(key) === next) { lastWrite.delete(key); knownSaved.delete(key) } }
  next.then(done, done)
  return next
}

/**
 * Saves each owner once `saved` (the save of that row) has finished, in the order the owners were picked. A refusal puts back the last
 * owner that really saved (unless something newer is showing) and says why.
 */
export async function saveOwners(
  saved: Promise<unknown>,
  writes: OwnerWrite[],
  deps: Deps = { write: setItemOwner, tell: text => notify(text) },
): Promise<void> {
  if (writes.length === 0) return
  await Promise.all(writes.map(w => queued(w, deps, saved)))
}

/** Resolves once every row save and owner write that is under way has finished (for checks, so they need no guessed waiting time). */
export async function ownerSavesIdle(): Promise<void> {
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 0))
    const pending = [...rowsSaving.values(), ...lastWrite.values()]
    if (pending.length === 0) return
    await Promise.allSettled(pending)
  }
}
