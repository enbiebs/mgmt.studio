import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fail, parseJson, requireUser, serverError } from '@/lib/api-guard'
import { inviteResendBody } from '@/lib/api-schemas'

// Sends an invitation again, in case the email got lost. Someone who has never signed in gets a fresh invitation (their
// login and the pages chosen for them already exist, so nothing about their access changes). Someone who HAS signed in
// (for example they opened the link but never chose a password) gets a link to set a password instead. Manager-only,
// only for someone in the caller's own company, never a manager and never the caller.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, inviteResendBody)
  if (body.error) return body.error

  const who = await requireUser('invite')
  if (who.error) return who.error
  const { supabase, user } = who

  const { data: me } = await supabase
    .from('workspace_members').select('workspace_id, role').eq('user_id', user.id).single()
  if (!me || me.role !== 'manager') return fail(403, 'Only a manager can send an invitation again')

  const admin = createAdminClient()
  const { data: target } = await admin
    .from('workspace_members').select('id, user_id, role, workspace_id').eq('id', body.data.memberId).maybeSingle()
  if (!target || target.workspace_id !== me.workspace_id || target.role === 'manager' || target.user_id === user.id) {
    return fail(404, 'That person was not found')
  }

  const { data: login, error: loginErr } = await admin.auth.admin.getUserById(target.user_id)
  if (loginErr) return serverError('Resend invite: read login', loginErr, "Couldn't send that again. Please try again.")
  const email = login?.user?.email
  if (!login?.user || !email) return fail(404, 'That person was not found')

  // The email's button must come back to THIS site's accept page (see the invite route for why it names the address itself).
  const redirectTo = `${new URL(req.url).origin}/auth/accept`
  const tooSoon = (e: { code?: string; status?: number }) => e.code === 'over_email_send_rate_limit' || e.status === 429
  const waitMessage = 'An email was just sent to them. Please wait a minute and try again.'

  if (!login.user.last_sign_in_at) {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (!error) return NextResponse.json({ ok: true, kind: 'invite' })
    if (tooSoon(error)) return fail(429, waitMessage)
    // If Supabase treats them as already registered, a password link is the next best way in.
    if (!(error.code === 'email_exists' || /already.*registered/i.test(error.message))) {
      return serverError('Resend invite failed', error, "Couldn't send that again. Please try again.")
    }
  }

  const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo })
  if (error) {
    if (tooSoon(error)) return fail(429, waitMessage)
    return serverError('Resend password link failed', error, "Couldn't send that again. Please try again.")
  }
  return NextResponse.json({ ok: true, kind: 'password' })
}
