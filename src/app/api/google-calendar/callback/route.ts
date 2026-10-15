import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForTokens, createDedicatedCalendar } from '@/lib/google-calendar'
import { requireClientAccess } from '@/lib/api-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { uid } from '@/lib/utils'

// Google redirects the browser here after consent. Finishes the connection:
// swaps the temporary code for real tokens, creates the dedicated calendar
// this connection syncs against, and stores the tokens server-side only
// (google_calendar_connections has no RLS policy — same posture as
// bank_connections, see supabase/migrations/018_google_calendar_connections.sql).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const appUrl = new URL('/', req.url)

  if (!code || !state) {
    appUrl.searchParams.set('google_calendar_error', 'missing_params')
    return NextResponse.redirect(appUrl)
  }

  const [userId, clientId, timeZone] = state.split(':')
  if (!userId || !clientId) {
    appUrl.searchParams.set('google_calendar_error', 'bad_state')
    return NextResponse.redirect(appUrl)
  }

  // Whoever finishes the connection must be the same signed-in person who started it, and still allowed to set it up.
  const gate = await requireClientAccess(clientId, { section: 'tour', edit: true, managementSide: true })
  if (gate.error || gate.user.id !== userId) {
    appUrl.searchParams.set('google_calendar_error', gate.error ? 'not_allowed' : 'session_mismatch')
    return NextResponse.redirect(appUrl)
  }
  const { supabase } = gate

  const { data: client, error } = await supabase.from('clients').select('id, name, workspace_id').eq('id', clientId).single()
  if (error || !client) {
    appUrl.searchParams.set('google_calendar_error', 'client_not_found')
    return NextResponse.redirect(appUrl)
  }

  try {
    const { accessToken, refreshToken, expiryDate } = await exchangeCodeForTokens(code)
    const googleCalendarId = await createDedicatedCalendar(accessToken, client.name)

    const admin = createAdminClient()
    const { error: insertErr } = await admin.from('google_calendar_connections').insert({
      id: 'gcal-conn-' + uid(),
      client_id: client.id,
      workspace_id: client.workspace_id,
      google_calendar_id: googleCalendarId,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expiry: expiryDate ? new Date(expiryDate).toISOString() : null,
      time_zone: timeZone || 'UTC',
    })
    if (insertErr) throw new Error(insertErr.message)

    appUrl.searchParams.set('google_calendar_connected', clientId)
    return NextResponse.redirect(appUrl)
  } catch {
    appUrl.searchParams.set('google_calendar_error', 'connect_failed')
    return NextResponse.redirect(appUrl)
  }
}
