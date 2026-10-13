// Server-only: who may add or change things on a client's tour.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Same rule as everything else that edits the tour: Tour edit access to the client AND not the
// artist's own login. Both checks are the database functions the row-level security uses.
export async function requireTourEditAccess(clientId: unknown) {
  if (typeof clientId !== 'string' || !clientId) {
    return { error: NextResponse.json({ error: 'Missing clientId' }, { status: 400 }) }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Not signed in' }, { status: 401 }) }
  const [section, management] = await Promise.all([
    supabase.rpc('has_section_access', { target_client_id: clientId, target_section: 'tour', require_edit: true }),
    supabase.rpc('is_management_side', { target_client_id: clientId }),
  ])
  if (section.data !== true || management.data !== true) {
    return { error: NextResponse.json({ error: 'Not allowed' }, { status: 403 }) }
  }
  return { user }
}
