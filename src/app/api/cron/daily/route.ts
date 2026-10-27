import { NextRequest, NextResponse } from 'next/server'
import { syncAllConnections } from '@/lib/google-calendar-pull'
import { runDailyEmails } from '@/lib/daily-email-server'

export const maxDuration = 60

// Triggered by Vercel Cron (see vercel.json) once a morning. Does the day's two jobs, each on its own so one failing never stops the other:
// pulls changes back from connected Google Calendars (what /api/google-calendar/sync did on its own before), and sends the morning email
// and the contract reminders (lib/daily-email-server.ts; nothing is sent until email is set up in the server's settings).
// Vercel sends `Authorization: Bearer $CRON_SECRET` on cron calls once that env var is set, so this checks it to reject anyone else.
//
// Add ?dryRun=1 to try it by hand: it sends nothing, records nothing, skips the calendar pull, and answers with counts only.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1'

  // The two jobs run side by side (each has its own time limit and its own failure handling), so a slow calendar pull cannot starve the emails.
  const [calendarDone, emailDone] = await Promise.allSettled([
    dryRun ? Promise.resolve('skipped (dry run)') : syncAllConnections(),
    runDailyEmails({ dryRun }),
  ])
  if (calendarDone.status === 'rejected') console.error('Google Calendar sync failed', calendarDone.reason)
  if (emailDone.status === 'rejected') console.error('Daily email failed:', emailDone.reason instanceof Error ? emailDone.reason.name : 'error')
  const calendar = calendarDone.status === 'fulfilled' ? calendarDone.value : { error: 'Sync failed' }
  const email = emailDone.status === 'fulfilled' ? emailDone.value : { error: 'Email job failed' }
  return NextResponse.json({ ok: true, calendar, email })
}
