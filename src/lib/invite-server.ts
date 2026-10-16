// Server-only: a gentle nudge for someone who ALREADY has a login and has just been invited to another company. The
// invitation itself waits in the app (they choose Accept or Decline); this sends the normal sign-in email so they know
// to open it. Any failure is only logged: the invitation is still waiting, and they will see it next time they open the app.
import { createAdminClient } from '@/lib/supabase/admin'

export async function nudgeExistingLogin(email: string, origin: string): Promise<void> {
  try {
    const { error } = await createAdminClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: `${origin}/auth/accept` } })
    if (error) console.error('Invitation nudge not sent', error.message)
  } catch (e) {
    console.error('Invitation nudge failed', e)
  }
}

/** Is this email already a login, and if so is it already a member of THIS company (any role)? memberId is set unless they are an admin. */
export async function loginStatus(admin: ReturnType<typeof createAdminClient>, email: string, workspaceId: string): Promise<{ exists: boolean; here: boolean; memberId: string | null }> {
  for (let page = 1; page <= 10; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    const users = data?.users ?? []
    const hit = users.find(u => u.email?.toLowerCase() === email)
    if (hit) {
      const { data: member } = await admin.from('workspace_members').select('id, role').eq('user_id', hit.id).eq('workspace_id', workspaceId).maybeSingle()
      return { exists: true, here: !!member, memberId: member && member.role !== 'manager' ? member.id : null }
    }
    if (users.length < 200) break
  }
  return { exists: false, here: false, memberId: null }
}
