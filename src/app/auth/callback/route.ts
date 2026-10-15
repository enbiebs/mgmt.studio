// ──────────────────────────────────────────────────────────
//  Auth Callback Route
//  Handles magic link and OAuth redirects from Supabase.
//  Exchanges the code for a session, then redirects home.
// ──────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/safe-redirect'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // The "next" address comes from a link, so only plain paths on this site are followed.
  const next = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  // Auth failed - redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
