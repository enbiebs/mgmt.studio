import { NextRequest, NextResponse } from 'next/server'
import { addressKey, rateLimit } from '@/lib/api-guard'
import { checkUnsubscribe } from '@/lib/email-unsubscribe'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

// The "Stop these emails" link in the reminders sent to outside people (a lawyer, an assistant). It has no sign-in: the link carries the
// address and a signature only our server can make (lib/email-unsubscribe.ts), so it works for exactly the address the email went to.
// It only ever ADDS the address to the list of people we never email again; that is harmless to repeat. Mail programs' one-click
// "Unsubscribe" button sends a POST, a person clicking the link in the email sends a GET: both do the same.
async function stop(req: NextRequest) {
  const limited = await rateLimit(addressKey(req), 'public')
  if (limited) return limited
  const url = new URL(req.url)
  const address = checkUnsubscribe(url.searchParams.get('a'), url.searchParams.get('t'))
  if (!address) return page('That link is not valid.', 400)
  const { error } = await createAdminClient().from('email_suppressions').upsert({ address }, { onConflict: 'address' })
  if (error) { console.error('Unsubscribe: could not save'); return page('Something went wrong. Please try again in a minute.', 500) }
  return page('Done. You will not get these emails any more.', 200)
}

function page(message: string, status: number) {
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mgmt Path</title>` +
    `<body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:420px;margin:15vh auto;padding:0 16px;color:#1f1d1a"><p style="font-size:18px">${message}</p></body>`
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } })
}

export const GET = stop
export const POST = stop
