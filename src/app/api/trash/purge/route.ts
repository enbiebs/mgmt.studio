import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { removeBillFiles } from '@/lib/trash-files'

// Triggered by Vercel Cron (see vercel.json) once a day: removes every copy in the trash that is past its 30 days, and the stored files it
// kept. A copy is only removed once its files are, so a failure is simply tried again tomorrow. Vercel sends
// `Authorization: Bearer $CRON_SECRET` on cron calls once that env var is set, so this checks it to reject anyone else.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = createAdminClient()
  const { data, error } = await admin.from('trash_items').select('id, client_id, files').lte('expires_at', new Date().toISOString()).order('expires_at', { ascending: true }).limit(500)
  if (error) {
    console.error('Trash purge: could not list expired copies', error)
    return NextResponse.json({ error: 'Purge failed' }, { status: 500 })
  }
  let removed = 0, kept = 0
  for (const row of (data ?? []) as { id: string; client_id: string; files: string[] | null }[]) {
    try {
      const left = await removeBillFiles(admin, row.client_id, row.files ?? [], row.id)
      if (left.length > 0) { kept++; continue }                                  // try again tomorrow
      const { error: delError } = await admin.from('trash_items').delete().eq('id', row.id)
      if (delError) throw delError
      removed++
    } catch (e) { console.error('Trash purge: could not clear', row.id, e); kept++ }
  }
  return NextResponse.json({ ok: true, removed, kept })
}
