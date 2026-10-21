import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fail, parseJson, requireUser, serverError } from '@/lib/api-guard'
import { trashIdBody } from '@/lib/api-schemas'
import { removeBillFiles } from '@/lib/trash-files'

// "Delete for good" on a copy in the trash. The database function checks that this person may see and remove the copy (the same rule
// as the Trash list) and removes it; then the stored file it kept (a bill's PDF) is removed too, unless a live bill still uses it.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, trashIdBody)
  if (body.error) return body.error
  const who = await requireUser('file')
  if (who.error) return who.error

  // Who the copy belongs to (the list only shows a person the copies they may see, so this is also the first permission check).
  const found = await who.supabase.from('trash_items').select('client_id').eq('id', body.data.trashId).maybeSingle()
  if (found.error) return serverError('Trash: could not read the copy', found.error)
  if (!found.data) return fail(404, 'Not found')
  const clientId = String((found.data as { client_id: string }).client_id)

  const { data, error } = await who.supabase.rpc('trash_discard', { p_trash_id: body.data.trashId })
  if (error) return error.code === '42501' ? fail(403, 'Not allowed') : serverError('Trash: delete for good failed', error)

  const files = Array.isArray(data) ? (data as string[]) : []
  let leftBehind: string[] = []
  try { leftBehind = await removeBillFiles(createAdminClient(), clientId, files) } catch (e) { console.error('Trash: could not check the stored files', e); leftBehind = files }
  if (leftBehind.length > 0) console.error('Trash: the copy is gone but these stored files were not removed:', leftBehind)
  return NextResponse.json({ ok: true })
}
