import { NextRequest, NextResponse } from 'next/server'
import { getAuthUrl } from '@/lib/google-calendar'
import { createClient } from '@/lib/supabase/server'

// Starts connecting one client's Google Calendar. Returns the Google
// consent URL for the browser to navigate to — Google itself handles the
// actual login, the same way Plaid's own Link UI does for bank connections
// (see src/app/api/plaid/create-link-token/route.ts).
export async function POST(req: NextRequest) {
  const { clientId, timeZone } = await req.json()
  if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  // RLS on `clients` rejects this if the user isn't in that client's workspace.
  const { data: client, error } = await supabase.from('clients').select('id').eq('id', clientId).single()
  if (error || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  // The server has no access to the browser's timezone on its own, so the
  // browser passes its own Intl-resolved zone through — carried in `state`
  // since that's the one thing Google hands straight back at the callback.
  const state = `${user.id}:${clientId}:${timeZone || 'UTC'}`
  return NextResponse.json({ url: getAuthUrl(state) })
}
