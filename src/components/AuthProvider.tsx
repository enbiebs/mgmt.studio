'use client'
// ──────────────────────────────────────────────────────────
//  AuthProvider
//
//  Wraps the app. On mount:
//   1. Gets the current Supabase session
//   2. Calls store.initFromSupabase(userId) to hydrate from DB
//   3. Subscribes to auth state changes (sign-in / sign-out)
//
//  When NEXT_PUBLIC_SUPABASE_URL is not set, runs in demo mode:
//  no auth, local state only, demo data pre-loaded.
// ──────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { useStore } from '@/lib/store'

const SUPABASE_CONFIGURED =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { initFromSupabase } = useStore()

  useEffect(() => {
    // Demo mode: no credentials — just use localStorage / demo data as-is
    if (!SUPABASE_CONFIGURED) return

    // Skip on auth routes — no session expected there
    const isAuthRoute = window.location.pathname.startsWith('/login') ||
                        window.location.pathname.startsWith('/auth')
    if (isAuthRoute) return

    // Dynamically import so the module doesn't fail when vars are missing
    import('@/lib/supabase/client').then(({ createClient }) => {
      const supabase = createClient()

      // Hydrate store from current session
      supabase.auth.getUser().then(({ data }) => {
        if (data.user) {
          initFromSupabase(data.user.id)
        } else {
          // No session — middleware should have caught this, but just in case
          window.location.href = '/login'
        }
      })

      // Listen for auth state changes (sign out, token refresh, etc.)
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          window.location.href = '/login'
        }
      })

      return () => subscription.unsubscribe()
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}
