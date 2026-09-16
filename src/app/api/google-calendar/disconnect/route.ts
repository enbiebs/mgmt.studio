import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Removes a client's Google Calendar connection (and, via cascade, its
// event links). Deliberately does not delete the dedicated Google Calendar
// itself — disconnecting here should never destroy anything on Google's side.
export async function POST(req: NextRequest) {
  const { clientId } = await req.json()
  if (!clientId) return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: client, error } = await supabase.from('clients').select('id').eq('id', clientId).single()
  if (error || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const admin = createAdminClient()
  const { error: deleteErr } = await admin.from('google_calendar_connections').delete().eq('client_id', clientId)
  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
