import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fail, parseJson, requireUser, serverError } from '@/lib/api-guard'
import { inviteCancelBody } from '@/lib/api-schemas'
import { managedWorkspace } from '@/lib/company-guard'

// Cancels an invitation that nobody has accepted yet: the login that was created when the email went out is deleted
// along with its access, so a wrong address leaves nothing behind. Manager-only, only for someone in the caller's own
// company, never a manager, and never anyone who has signed in (those people are removed from an artist instead).
export async function POST(req: NextRequest) {
  const body = await parseJson(req, inviteCancelBody)
  if (body.error) return body.error

  const who = await requireUser('invite')
  if (who.error) return who.error
  const { supabase, user } = who

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('workspace_members').select('id, user_id, role, workspace_id').eq('id', body.data.memberId).maybeSingle()
  if (!target || target.role === 'manager' || target.user_id === user.id) return fail(404, 'That invitation was not found')
  // the caller must manage the company the invitation is in (they may manage several)
  const mw = await managedWorkspace(supabase, user.id, target.workspace_id, 'cancel an invitation')
  if ('error' in mw) return fail(404, 'That invitation was not found')

  const { data: login, error: loginErr } = await admin.auth.admin.getUserById(target.user_id)
  if (loginErr) return serverError('Cancel invite: read login', loginErr, "Couldn't cancel that invitation. Please try again.")
  if (!login?.user) return fail(404, 'That invitation was not found')
  if (login.user.last_sign_in_at) return fail(409, 'They have already accepted. Remove their access to the artist instead.')

  const { error: memberErr } = await admin.from('workspace_members').delete().eq('id', target.id)
  if (memberErr) return serverError('Cancel invite: member', memberErr, "Couldn't cancel that invitation. Please try again.")
  // A login that belongs to any other company is left alone: only this company's membership goes.
  const { count: others } = await admin.from('workspace_members').select('id', { count: 'exact', head: true }).eq('user_id', target.user_id)
  if ((others ?? 0) > 0) return NextResponse.json({ ok: true })
  const { error } = await admin.auth.admin.deleteUser(target.user_id)
  if (error) return serverError('Cancel invite: login', error, "Couldn't cancel that invitation. Please try again.")
  return NextResponse.json({ ok: true })
}
