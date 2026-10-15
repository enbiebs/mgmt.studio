import { NextRequest, NextResponse } from 'next/server'
import { isClientId, requireClientAccess } from '@/lib/api-guard'
import { createAdminClient } from '@/lib/supabase/admin'

// Reports whether a client has an active Google Calendar connection,
// without exposing anything from google_calendar_connections itself (no
// RLS policy on that table means the browser can never read it directly).
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!isClientId(clientId)) return NextResponse.json({ error: 'Missing or invalid clientId' }, { status: 400 })

  // Anyone who can see this artist's tour may see whether its calendar is connected (nothing from the connection itself is returned).
  const gate = await requireClientAccess(clientId, { section: 'tour', edit: false, managementSide: false })
  if (gate.error) return gate.error

  const admin = createAdminClient()
  const { data } = await admin.from('google_calendar_connections').select('id').eq('client_id', clientId).maybeSingle()

  // `configured` is only whether the Google keys exist on the server (never their values), so the
  // screen can hide a Connect button that could only lead to a Google error page.
  const configured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI)
  return NextResponse.json({ connected: !!data, configured })
}
