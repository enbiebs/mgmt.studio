// Server-only helpers for an artist's photo and logo: where the files live, who may change or see them, and
// what counts as a real image. Never import this from a 'use client' component.
import { fail, isClientId, requireUser, type LimitName } from '@/lib/api-guard'

export { BRANDING_BUCKET, BRANDING_COLUMN, BRANDING_EXT, BRANDING_TYPE, MAX_BRANDING_BYTES, extOfPath, isBrandingPathFor, verifiedImageKind, type BrandingKind } from '@/lib/branding-paths'

/**
 * May this person change the artist's photo and logo? A teammate needs edit access to the artist's Profile;
 * the artist's own login may set their own. (The artist login is the only one that is not on the management
 * side but can edit Projects, which is how the two are told apart. Both checks are the database's own functions.)
 */
export async function requireBrandingEdit(clientId: unknown, limit: LimitName) {
  if (!isClientId(clientId)) return { error: fail(400, 'Missing or invalid clientId') }
  const who = await requireUser(limit)
  if (who.error) return { error: who.error }
  const { supabase, user } = who
  const [management, profile, projects] = await Promise.all([
    supabase.rpc('is_management_side', { target_client_id: clientId }),
    supabase.rpc('has_section_access', { target_client_id: clientId, target_section: 'profile', require_edit: true }),
    supabase.rpc('has_section_access', { target_client_id: clientId, target_section: 'projects', require_edit: true }),
  ])
  const allowed = management.data === true ? profile.data === true : projects.data === true
  if (!allowed) return { error: fail(403, 'Not allowed') }
  return { user, supabase, clientId }
}

/** May this person see the artist's photo and logo? Anyone who may open the artist at all. */
export async function requireBrandingView(clientId: unknown) {
  if (!isClientId(clientId)) return { error: fail(400, 'Missing or invalid clientId') }
  const who = await requireUser('file')
  if (who.error) return { error: who.error }
  const { data } = await who.supabase.rpc('can_open_client', { target_client_id: clientId })
  if (data !== true) return { error: fail(403, 'Not allowed') }
  return { user: who.user, supabase: who.supabase, clientId }
}
