'use client'
// ──────────────────────────────────────────────────────────
//  Accept Invite
//  Where the "Accept invite" button in an invitation email lands.
//  Supabase sends the sign-in details after a "#" in the address (only the browser
//  can read that), so this page picks them up, signs the person in, and sends them
//  on to choose a password. Their pages were set up when the invite was sent.
// ──────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { parseAuthHash } from '@/lib/auth-hash'
import { PRODUCT_NAME } from '@/lib/brand'

const EXPIRED = 'This invitation link has expired or was already used.'

export default function AcceptInvitePage() {
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function finish() {
      // Read the address first: creating the sign-in client can clear it.
      const found = parseAuthHash(window.location.hash)
      if (found.kind !== 'session') {
        if (!cancelled) setProblem(found.kind === 'error' ? EXPIRED : "This link doesn't look right.")
        return
      }
      const { error } = await createClient().auth.setSession({ access_token: found.accessToken, refresh_token: found.refreshToken })
      if (cancelled) return
      if (error) { setProblem(EXPIRED); return }
      window.history.replaceState(null, '', window.location.pathname)   // the sign-in details don't belong in the address bar
      window.location.replace('/auth/update-password?welcome=1')
    }
    finish()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <div className="font-serif font-semibold text-2xl tracking-tight mb-1">{PRODUCT_NAME}</div>
        <div className="text-sm text-gray-400">{problem ? 'We couldn’t open your invitation' : 'Opening your invitation…'}</div>
      </div>

      {problem && (
        <div className="w-full max-w-sm space-y-4 text-center">
          <div className="text-xs px-3 py-2.5 rounded-xl bg-red-50 text-red-600">{problem}</div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Your invitation is still good. Go to the sign-in page, choose <strong>Forgot password?</strong>, enter the email the invitation was sent to,
            and we&apos;ll email you a fresh link to choose your password.
          </p>
          <a
            href="/login"
            className="block w-full bg-gray-900 text-canvas py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors"
          >
            Go to sign in
          </a>
        </div>
      )}
    </div>
  )
}
