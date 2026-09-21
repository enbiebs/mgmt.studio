import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pushShowToGoogle, pushPostToGoogle, pushProjectToGoogle } from '@/lib/google-calendar-sync'
import type { Show, Post, Project } from '@/types'

// Called by the store (src/lib/store.ts) after a Show/Post/Project save —
// store.ts runs in the browser and can't call the server-only Google sync
// code directly, so this route is the bridge, the same role
// /api/plaid/sync plays for bank data. A no-op if the client has no
// Google Calendar connection (see pushRecord in google-calendar-sync.ts).
export async function POST(req: NextRequest) {
  const { clientId, recordType, record } = await req.json()
  if (!clientId || !recordType || !record) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: client, error } = await supabase.from('clients').select('id').eq('id', clientId).single()
  if (error || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  try {
    if (recordType === 'show') await pushShowToGoogle(record as Show, clientId)
    else if (recordType === 'post') await pushPostToGoogle(record as Post, clientId)
    else if (recordType === 'project') await pushProjectToGoogle(record as Project, clientId)
    else return NextResponse.json({ error: 'Unknown recordType' }, { status: 400 })
  } catch (e) {
    // A failed Google push shouldn't be treated as a failed save — the
    // record is already saved in Mgmt Studio regardless. Log and return ok.
    console.error('Google Calendar push failed', e)
  }

  return NextResponse.json({ ok: true })
}
