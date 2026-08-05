// Server-only Supabase client using the service role key. This bypasses row
// level security entirely, so it must never be imported from a 'use client'
// component or sent to the browser — only from route handlers under
// src/app/api. It exists for the one case a normal user session can't
// handle: writing/reading bank_connections.access_token, which has no RLS
// policy at all (see supabase/migrations/009_bank_connections.sql).
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
