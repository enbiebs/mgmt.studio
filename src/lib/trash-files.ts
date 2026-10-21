// Server-only: removing the stored files (bill PDFs) that a trash copy kept. A file is only ever removed when it belongs to the copy's own
// artist (its path starts with that artist's id) and nothing else points at it: not a live bill, and not another copy that is still being
// kept. Never import this from a 'use client' component.
import type { SupabaseClient } from '@supabase/supabase-js'
import { BILLS_BUCKET, isBillPathFor } from '@/lib/bills'

/** Where a bill PDF lives: "<clientId>/<name>.pdf". Anything else is not ours to remove. */
const BILL_PATH = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,200}\.pdf$/
export const isBillFilePath = (p: unknown): p is string => typeof p === 'string' && BILL_PATH.test(p) && !p.includes('..')

/** Which of these paths a live bill, or another copy in the trash, still uses. Throws if that cannot be checked (then nothing is removed). */
export async function pathsStillInUse(admin: SupabaseClient, paths: string[], exceptTrashId?: string): Promise<Set<string>> {
  const used = new Set<string>()
  if (paths.length === 0) return used
  const live = await admin.from('expenses').select('bill_file_path').in('bill_file_path', paths)
  if (live.error) throw live.error
  for (const r of live.data ?? []) used.add(String((r as { bill_file_path: string }).bill_file_path))
  let q = admin.from('trash_items').select('files').overlaps('files', paths)
  if (exceptTrashId) q = q.neq('id', exceptTrashId)
  const kept = await q
  if (kept.error) throw kept.error
  for (const r of kept.data ?? []) for (const f of (r as { files: string[] }).files ?? []) used.add(f)
  return used
}

/**
 * Removes the files of a copy that nothing else uses. `clientId` is the copy's artist: a path that is not under that artist is never
 * touched (and is logged). Returns the paths that should have been removed but could not be (so the caller can try again later).
 * Throws when it cannot check whether the files are still in use (then nothing is removed).
 */
export async function removeBillFiles(admin: SupabaseClient, clientId: string, paths: string[], exceptTrashId?: string): Promise<string[]> {
  const ours = paths.filter(p => isBillFilePath(p) && isBillPathFor(clientId, p))
  for (const p of paths) if (!ours.includes(p)) console.error('Trash: ignoring a stored-file path that is not a bill PDF of this artist:', p)
  const used = await pathsStillInUse(admin, ours, exceptTrashId)
  const toRemove = ours.filter(p => !used.has(p))
  if (toRemove.length === 0) return []
  const { error } = await admin.storage.from(BILLS_BUCKET).remove(toRemove)
  if (error) { console.error('Could not remove stored files', error); return toRemove }
  return []
}
