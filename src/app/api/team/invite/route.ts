import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fail, parseJson, requireUser, serverError } from '@/lib/api-guard'
import { inviteBody } from '@/lib/api-schemas'
import { inviteGrantRows } from '@/lib/invite-access'

type Admin = ReturnType<typeof createAdminClient>

/** The login this email already belongs to IN THIS COMPANY (never someone else's), so the screen can offer to send them a password link instead. */
async function existingMemberId(admin: Admin, email: string, workspaceId: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const users = data?.users ?? []
    const hit = users.find(u => u.email?.toLowerCase() === email)
    if (hit) {
      const { data: member } = await admin.from('workspace_members').select('id, role').eq('user_id', hit.id).eq('workspace_id', workspaceId).is('client_id', null).maybeSingle()
      return member && member.role !== 'manager' ? member.id : null
    }
    if (users.length < 200) return null
  }
  return null
}

// Sends a real email invite that joins the invited person into the
// caller's existing workspace (see handle_new_user() in
// supabase/migrations/046 and 052) instead of spinning up a new one, with the
// pages the inviter chose already waiting. Manager-only - checked here and
// enforced again by RLS on every table the invited person will ever touch.
export async function POST(req: NextRequest) {
  const body = await parseJson(req, inviteBody)
  if (body.error) return body.error
  const { email, role, personId, clientId, access } = body.data

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

  // The pages chosen for each artist. Every artist must be one of THIS company's real artists (a demo artist is private
  // to its owner), and an invite that carries access has to give at least one page. The database checks all of it again
  // when the login is created and ignores anything that does not hold up.
  let rows: ReturnType<typeof inviteGrantRows> = []
  if (access && access.length > 0) {
    const ids = [...new Set(access.map(a => a.clientId))]
    const { data: found } = await supabase.from('clients').select('id, demo_owner').in('id', ids)
    if (!found || found.length !== ids.length || found.some(c => c.demo_owner)) return fail(400, 'One of those artists was not found')
    rows = inviteGrantRows(access)
    if (rows.length === 0) return fail(400, 'Choose at least one page to give them')
  }

  // The invitation itself lives in a table only this server can write. When the invited person's account is created,
  // the database looks the email up THERE to decide which workspace, role, artist and pages they get. It never trusts
  // what an account says about itself, so nobody can sign up and award themselves access (see migrations 046 and 052).
  const admin = createAdminClient()
  const address = email.toLowerCase()
  const clearMine = () => admin.from('pending_invites').delete().eq('email', address).eq('workspace_id', wm.workspace_id).is('used_at', null)
  await clearMine()    // a new invitation replaces THIS company's earlier unused one (never another company's)
  const { error: saveErr } = await admin.from('pending_invites').insert({
    email: address, workspace_id: wm.workspace_id, role, person_id: personId ?? null, client_id: clientId ?? null, created_by: user.id, access: rows,
  })
  if (saveErr) return serverError('Invite could not be recorded', saveErr, "Couldn't send that invitation. Please try again.")

  // The button in the email must come back to THIS site's accept page. Without an address of its own the email falls
  // back to the project's "Site URL" setting, and a bare "mgmtpath.com" there (no https://) is what made the first
  // real invite end on a blank error page.
  const { data: invited, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: `${new URL(req.url).origin}/auth/accept` })
  if (error) {
    await clearMine()   // nothing was sent, so nothing stays pending
    if (error.code === 'email_exists' || /already.*registered/i.test(error.message)) {
      // Not an invitation any more: if they are already part of this company, say which login so a password link can be sent instead.
      const existing = await existingMemberId(admin, address, wm.workspace_id)
      return NextResponse.json({ error: "That email already has a login, so it can't be invited again.", existingMemberId: existing }, { status: 409 })
    }
    return serverError('Invite failed', error, "Couldn't send that invitation. Check the email address and try again.")
  }

  // If the chosen pages could not be set up, the person still exists: say so, so it can be fixed on the Team page.
  const { data: sent } = await admin.from('pending_invites').select('apply_error').eq('email', address).eq('workspace_id', wm.workspace_id).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const warning = sent?.apply_error ? "They were invited, but their pages could not be set up. Set them on the Team page." : undefined
  return NextResponse.json({ ok: true, userId: invited.user?.id, warning })
}
