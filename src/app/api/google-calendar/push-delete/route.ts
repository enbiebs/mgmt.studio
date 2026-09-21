import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteShowFromGoogle, deletePostFromGoogle, deleteProjectFromGoogle } from '@/lib/google-calendar-sync'

// Mirrors /api/google-calendar/push, for deletes. Called by the store
// after a Show/Post/Project is deleted locally.
export async function POST(req: NextRequest) {
  const { clientId, recordType, recordId } = await req.json()
  if (!clientId || !recordType || !recordId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: client, error } = await supabase.from('clients').select('id').eq('id', clientId).single()
  if (error || !client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  try {
    if (recordType === 'show') await deleteShowFromGoogle(recordId, clientId)
    else if (recordType === 'post') await deletePostFromGoogle(recordId, clientId)
    else if (recordType === 'project') await deleteProjectFromGoogle(recordId, clientId)
    else return NextResponse.json({ error: 'Unknown recordType' }, { status: 400 })
  } catch (e) {
    console.error('Google Calendar delete push failed', e)
  }

  return NextResponse.json({ ok: true })
}
