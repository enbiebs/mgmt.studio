import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fail, parseJson, requireUser, serverError } from '@/lib/api-guard'
import { inviteBody } from '@/lib/api-schemas'
import { inviteGrantRows } from '@/lib/invite-access'
import { managedWorkspace } from '@/lib/company-guard'
import { loginStatus, nudgeExistingLogin } from '@/lib/invite-server'

// Sends a real email invite that joins the invited person into the
// caller's existing workspace (see handle_new_user() in
// supabase/migrations/046 and 052) instead of spinning up a new one, with the
// pages the inviter chose already waiting. Manager-only - checked here and
// enforced again by RLS on every table the invited person will ever touch.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, inviteBody)
  if (body.error) return body.error
  const { email, role, personId, clientId, access, workspaceId: requestedWorkspace } = body.data

  const who = await requireUser('invite')
  if (who.error) return who.error
  const { supabase, user } = who

  // Which company this is for: the one the screen names (the sender must manage it), or their only one.
  const mw = await managedWorkspace(supabase, user.id, requestedWorkspace, 'invite people to log in')
  if ('error' in mw) return mw.error
  const workspaceId = mw.workspaceId

  // The artist and the person named in the invitation must belong to the caller's own workspace.
  // The row-level rules only ever show the caller their own workspace's rows, so "not found" covers both mistakes and tampering.
  if (clientId) {
    const { data } = await supabase.from('clients').select('id').eq('id', clientId).eq('workspace_id', workspaceId).maybeSingle()
    if (!data) return fail(400, 'That artist was not found')
  }
  if (personId) {
    const { data: card } = await supabase.from('people').select('id, client_id').eq('id', personId).maybeSingle()
    const { data: home } = card ? await supabase.from('clients').select('id').eq('id', card.client_id).eq('workspace_id', workspaceId).maybeSingle() : { data: null }
    if (!card || !home) return fail(400, 'That person was not found')
  }

  // The pages chosen for each artist. Every artist must be one of THIS company's real artists (a demo artist is private
  // to its owner), and an invite that carries access has to give at least one page. The database checks all of it again
  // when the login is created and ignores anything that does not hold up.
  let rows: ReturnType<typeof inviteGrantRows> = []
  if (access && access.length > 0) {
    const ids = [...new Set(access.map(a => a.clientId))]
    const { data: found } = await supabase.from('clients').select('id, demo_owner').in('id', ids).eq('workspace_id', workspaceId)
    if (!found || found.length !== ids.length || found.some(c => c.demo_owner)) return fail(400, 'One of those artists was not found')
    rows = inviteGrantRows(access)
    if (rows.length === 0) return fail(400, 'Choose at least one page to give them')
  }

  // The invitation itself lives in a table only this server can write. When the invited person's account is created,
  // the database looks the email up THERE to decide which workspace, role, artist and pages they get. It never trusts
  // what an account says about itself, so nobody can sign up and award themselves access (see migrations 046 and 052).
  const admin = createAdminClient()
  const address = email.toLowerCase()
  const clearMine = () => admin.from('pending_invites').delete().eq('email', address).eq('workspace_id', workspaceId).is('used_at', null)
  await clearMine()    // a new invitation replaces THIS company's earlier unused one (never another company's)
  const { error: saveErr } = await admin.from('pending_invites').insert({
    email: address, workspace_id: workspaceId, role, person_id: personId ?? null, client_id: clientId ?? null, created_by: user.id, access: rows,
  })
  if (saveErr) return serverError('Invite could not be recorded', saveErr, "Couldn't send that invitation. Please try again.")

  // The button in the email must come back to THIS site's accept page. Without an address of its own the email falls
  // back to the project's "Site URL" setting, and a bare "mgmtpath.com" there (no https://) is what made the first
  // real invite end on a blank error page.
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${new URL(req.url).origin}/auth/accept` })
  if (error) {
    if (error.code === 'email_exists' || /already.*registered/i.test(error.message)) {
      const found = await loginStatus(admin, address, workspaceId)
      if (found.here) {
        // Already part of THIS company: not an invitation any more. Say which login, so a password link can be sent instead.
        await clearMine()
        return NextResponse.json({ error: "That email already has a login, so it can't be invited again.", existingMemberId: found.memberId }, { status: 409 })
      }
      // A login that belongs to another company (or none yet): the invitation waits for them to accept it in the app, and
      // the answer on screen is exactly the same as for anyone else, so an invitation can never be used to find out who
      // else is on Mgmt Path.
      await nudgeExistingLogin(address, new URL(req.url).origin)
      return NextResponse.json({ ok: true })
    }
    await clearMine()   // nothing was sent, so nothing stays pending
    return serverError('Invite failed', error, "Couldn't send that invitation. Check the email address and try again.")
  }

  // If the chosen pages could not be set up, the person still exists: say so, so it can be fixed on the Team page.
  const { data: sent } = await admin.from('pending_invites').select('apply_error').eq('email', address).eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const warning = sent?.apply_error ? "They were invited, but their pages could not be set up. Set them on the Team page." : undefined
  return NextResponse.json({ ok: true, userId: invited.user?.id, warning })
}
