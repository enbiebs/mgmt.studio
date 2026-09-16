import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildIcsFeed } from '@/lib/ics'

// Public, unauthenticated feed — polled by calendar apps with no browser
// session (see the middleware bypass for this path). The token itself is
// the only access control, so this looks the client up with the
// service-role client rather than a user-scoped RLS query.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createAdminClient()

  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('calendar_token', token)
    .maybeSingle()

  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: shows } = await supabase
    .from('shows')
    .select('id, date, city, venue, time, status, notes')
    .eq('client_id', client.id)
    .order('date')

  const ics = buildIcsFeed(client.name, shows ?? [])

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${client.name.replace(/[^a-z0-9]/gi, '-')}-tour-dates.ics"`,
    },
  })
}
