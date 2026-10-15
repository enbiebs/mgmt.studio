// Server-only: the shared parts of the routes that read and write an artist's private details.
import type { User } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export const SECURE_TABLE = 'profile_secure'

/** "artist", or a person who really belongs to this artist's directory. (The browser only ever names one; we check it is real.) */
export async function subjectExists(clientId: string, subject: string): Promise<boolean> {
  if (subject === 'artist') return true
  const { data } = await createAdminClient().from('people').select('id').eq('id', subject).eq('client_id', clientId).maybeSingle()
  return !!data
}

/** How the person appears in the access log: the part of their email before the @. */
export const userLabel = (user: User) => (user.email ?? 'Someone').split('@')[0]

/** Records that someone looked at or changed private details (field NAMES only, never values). Returns false if it could not be recorded. */
export async function logAccess(user: User, clientId: string, subject: string, tier: 'private' | 'vault', action: 'reveal' | 'save', fields: string[]): Promise<boolean> {
  const { error } = await createAdminClient().from('profile_access_log').insert({
    user_id: user.id, user_label: userLabel(user), client_id: clientId, subject, tier, action, fields,
  })
  if (error) console.error('Access log write failed', error)
  return !error
}
