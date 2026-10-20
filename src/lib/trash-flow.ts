// ──────────────────────────────────────────────────────────
//  Deleting through the trash. The database keeps the copy AND deletes in one all-or-nothing step (trash_delete), so there is no
//  window in which something is deleted without a copy, or a copy exists for something that was not deleted. This file decides what the
//  person is told for each way that step can end:
//    - it worked                         -> deleted, with a copy (or none, if the item was never in the database: nothing to keep)
//    - no permission                     -> nothing was deleted, and it says why
//    - the trash is not set up yet       -> (this code went live before the database change) deleted the way it always was, no copy
//    - anything else                     -> nothing was deleted
//  The database call is passed in, so every one of these cases is checked without a database (scripts/check-trash-flow.ts).
// ──────────────────────────────────────────────────────────

import type { TrashKind } from '@/lib/trash'

export interface TrashDeps {
  /** Keeps a copy and deletes, in one step inside the database. Returns the copy's id, or null when the item is not in the database.
   *  Throws; `code` is 'missing' when the trash is not set up there, 'forbidden' for no permission. */
  trashDelete(args: { kind: TrashKind; id: string; label: string; detail?: string }): Promise<string | null>
}

export type TrashedDelete = { ok: true; trashId: string | null } | { ok: false; error: string }

/**
 * Turns what the database said to a function call into a short code: 'missing' (PostgREST says the function is not there), 'forbidden'
 * (no permission), or the database's own code. Note that "function does not exist" from INSIDE a function (42883) is a real fault, not
 * "not set up": treating it as missing would let deletes through without a copy.
 */
export function rpcErrorCode(e: { code?: string } | null | undefined): string | undefined {
  const code = e?.code
  if (code === 'PGRST202') return 'missing'
  if (code === '42501') return 'forbidden'
  return code
}

/** The same for reading the trash list: the table itself is not there. */
export function tableErrorCode(e: { code?: string } | null | undefined): string | undefined {
  const code = e?.code
  return code === '42P01' || code === 'PGRST205' ? 'missing' : code
}

export async function trashAndDelete(
  deps: TrashDeps,
  args: { kind: TrashKind; id: string; label: string; detail?: string; /** The way things were deleted before the trash existed. */ runLegacyDelete: () => Promise<unknown> },
): Promise<TrashedDelete> {
  try {
    return { ok: true, trashId: await deps.trashDelete({ kind: args.kind, id: args.id, label: args.label, detail: args.detail }) }
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'forbidden') return { ok: false, error: "You don't have permission to delete that. Nothing was changed." }
    if (code !== 'missing') {
      console.error(e)
      return { ok: false, error: "Couldn't delete that. Nothing was changed." }
    }
    console.warn('The trash is not set up yet: deleting without a copy.')
  }
  try { await args.runLegacyDelete() } catch (e) {
    console.error(e)
    return { ok: false, error: "Couldn't delete that. Nothing was changed." }
  }
  return { ok: true, trashId: null }
}
