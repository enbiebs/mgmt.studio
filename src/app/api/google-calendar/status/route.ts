import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Reports whether a client has an active Google Calendar connection,
// without exposing anything from google_calendar_connections itself (no
// RLS policy on that table means the browser can never read it directly).
export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: client, error } = await supabase.from('clients').select('id').eq('id', clientId).single()
  if (error || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const admin = createAdminClient()
  const { data } = await admin.from('google_calendar_connections').select('id').eq('client_id', clientId).maybeSingle()

  return NextResponse.json({ connected: !!data })
}
