import { NextRequest, NextResponse } from 'next/server'
import { syncAllConnections } from '@/lib/google-calendar-pull'

// Triggered by Vercel Cron (see vercel.json) — pulls changes from every
// connected client's Google Calendar back into Mgmt Studio, the reverse of
// the push path in src/app/api/google-calendar/push/route.ts. Vercel
// automatically sends `Authorization: Bearer $CRON_SECRET` on cron-triggered
// requests once that env var is set, so this checks it to reject anyone else.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncAllConnections()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    console.error('Google Calendar sync failed', e)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
