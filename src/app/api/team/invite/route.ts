import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Sends a real email invite that joins the invited person into the
// caller's existing workspace (see handle_new_user() in
// supabase/migrations/012_team_invites.sql) instead of spinning up a
// new one. Manager-only — checked here and enforced again by RLS on
// every table the invited person will ever touch.
export async function POST(req: NextRequest) {
  const { email, role, personId, clientId } = await req.json()
  if (!email || !role) return NextResponse.json({ error: 'Missing email or role' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: wm } = await supabase
    .from('workspace_members').select('workspace_id, role').eq('user_id', user.id).single()
  if (!wm || wm.role !== 'manager') {
    return NextResponse.json({ error: 'Only a manager can invite people to log in' }, { status: 403 })
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
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, userId: invited.user?.id })
}
