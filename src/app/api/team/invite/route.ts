import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fail, parseJson, requireUser, serverError } from '@/lib/api-guard'
import { inviteBody } from '@/lib/api-schemas'

// Sends a real email invite that joins the invited person into the
// caller's existing workspace (see handle_new_user() in
// supabase/migrations/012_team_invites.sql) instead of spinning up a
// new one. Manager-only - checked here and enforced again by RLS on
// every table the invited person will ever touch.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, inviteBody)
  if (body.error) return body.error
  const { email, role, personId, clientId } = body.data

  const who = await requireUser('invite')
  if (who.error) return who.error
  const { supabase, user } = who

  const { data: wm } = await supabase
    .from('workspace_members').select('workspace_id, role').eq('user_id', user.id).single()
  if (!wm || wm.role !== 'manager') return fail(403, 'Only a manager can invite people to log in')

  // The artist and the person named in the invitation must belong to the caller's own workspace.
  // The row-level rules only ever show the caller their own workspace's rows, so "not found" covers both mistakes and tampering.
  if (clientId) {
    const { data } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle()
    if (!data) return fail(400, 'That artist was not found')
  }
  if (personId) {
    const { data } = await supabase.from('people').select('id').eq('id', personId).maybeSingle()
    if (!data) return fail(400, 'That person was not found')
  }

  const admin = createAdminClient()
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: {
      invite_workspace_id: wm.workspace_id,
      invite_role: role,
      invite_person_id: personId ?? null,
      invite_client_id: clientId ?? null,
    },
  })
  if (error) return serverError('Invite failed', error, "Couldn't send that invitation. Check the email address and try again.")

  return NextResponse.json({ ok: true, userId: invited.user?.id })
}
