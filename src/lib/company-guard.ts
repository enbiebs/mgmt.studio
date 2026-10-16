// Server-only: which company a signed-in manager is acting for. A person can manage more than one company, so a route
// never assumes "their" company: it either is told which one or works it out from the person it is about.
import type { SupabaseClient } from '@supabase/supabase-js'
import { fail } from '@/lib/api-guard'

/** The company (the caller manages it) a request is about. `requested` is the company the screen says; without it the caller must manage exactly one. */
export async function managedWorkspace(supabase: SupabaseClient, userId: string, requested?: string | null, what = 'do that') {
  const { data } = await supabase.from('workspace_members').select('workspace_id, role, client_id').eq('user_id', userId)
  const mine = (data ?? []).filter(r => r.role === 'manager' && r.client_id === null)
  if (mine.length === 0) return { error: fail(403, `Only a manager can ${what}`) }
  const hit = requested ? mine.find(r => r.workspace_id === requested) : mine.length === 1 ? mine[0] : undefined
  if (!hit) return { error: requested ? fail(403, `Only a manager can ${what}`) : fail(400, 'Choose which company this is for') }
  return { workspaceId: hit.workspace_id as string }
}
