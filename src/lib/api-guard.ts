// Server-only helpers that every API route uses, so the same four questions get asked the same way:
//   1. Who is asking?                          requireUser / requireClientAccess
//   2. May they touch this artist?             requireClientAccess (the same database checks the row-level rules use)
//   3. Are they asking too often?              rateLimit
//   4. Is what they sent the right shape?      parseJson (zod)
// Never import this from a 'use client' component.
import { NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'
import type { ZodType } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const fail = (status: number, message: string, headers?: Record<string, string>) =>
  NextResponse.json({ error: message }, { status, headers })

/** How often one person (or one internet address) may call each kind of endpoint. */
export const LIMITS = {
  ai:     { max: 60,   windowSeconds: 3600 },   // anything that calls the AI reader: it costs money every time
  upload: { max: 60,   windowSeconds: 600 },    // asking for a place to upload a file
  file:   { max: 120,  windowSeconds: 60 },     // opening or removing a stored file, downloading a PDF
  branding: { max: 600, windowSeconds: 60 },    // an artist's photo or logo shown on a page (a roster can show many at once)
  bank:   { max: 60,   windowSeconds: 3600 },   // connecting or syncing a bank
  invite: { max: 10,   windowSeconds: 3600 },   // sending a login invitation email
  reveal: { max: 60,   windowSeconds: 600 },    // opening or saving an artist's private details
  sync:   { max: 1000, windowSeconds: 3600 },   // Google Calendar pushes: one import can touch many shows
  api:    { max: 300,  windowSeconds: 60 },     // everything else a signed-in person does
  public: { max: 60,   windowSeconds: 60 },     // endpoints that have no sign-in (calendar feed, error reports)
} as const
export type LimitName = keyof typeof LIMITS

/** Counts this call. Returns a "too many requests" response when the limit is passed, otherwise null. */
export async function rateLimit(who: string, name: LimitName): Promise<NextResponse | null> {
  const { max, windowSeconds } = LIMITS[name]
  try {
    const { data, error } = await createAdminClient().rpc('rate_limit_hit', {
      p_key: `${who}:${name}`, p_limit: max, p_window_seconds: windowSeconds,
    })
    if (error) throw error
    if (data === false) return fail(429, 'Too many requests. Please wait a little and try again.', { 'Retry-After': String(windowSeconds) })
  } catch (e) {
    // The limit is protection, not permission: if the counter is briefly unavailable, let the call through and say so in the logs.
    console.error('Rate limit check failed', e)
  }
  return null
}

/** A stable label for an unsigned-in caller: their address, scrambled so no raw address is stored. */
export function addressKey(req: Request): string {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  return 'ip:' + createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev').update(ip).digest('hex').slice(0, 24)
}

/** Ids from the browser are only ever letters, digits, dot, dash and underscore. */
export const isClientId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_.-]{1,100}$/.test(v)

/** The signed-in person, or a response to send back. Also counts the call against their limit. */
export async function requireUser(limit: LimitName = 'api') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: fail(401, 'Not signed in') }
  const limited = await rateLimit(`u:${user.id}`, limit)
  if (limited) return { error: limited }
  return { user, supabase }
}

type Section = 'finance' | 'tour' | 'deals' | 'content' | 'projects' | 'profile' | 'vault'

/**
 * The signed-in person, checked against ONE artist: they need access to the section (edit access when
 * `edit` is set) and, unless `managementSide` is false, must not be the artist's own login. The two checks
 * are the very database functions the row-level rules use, so a route can never allow more than the
 * database itself would.
 */
export async function requireClientAccess(
  clientId: unknown,
  opts: { section: Section; edit: boolean; limit?: LimitName; managementSide?: boolean },
) {
  if (!isClientId(clientId)) return { error: fail(400, 'Missing or invalid clientId') }
  const who = await requireUser(opts.limit ?? 'api')
  if (who.error) return { error: who.error }
  const { supabase, user } = who
  const [section, management] = await Promise.all([
    supabase.rpc('has_section_access', { target_client_id: clientId, target_section: opts.section, require_edit: opts.edit }),
    opts.managementSide === false ? Promise.resolve({ data: true }) : supabase.rpc('is_management_side', { target_client_id: clientId }),
  ])
  if (section.data !== true || management.data !== true) return { error: fail(403, 'Not allowed') }
  return { user, supabase, clientId }
}

/** Reads and checks a JSON body. Too big, not JSON, or the wrong shape all come back as a plain 4xx. */
export async function parseJson<T>(req: Request, schema: ZodType<T>, maxBytes = 100_000) {
  let text: string
  try { text = await req.text() } catch { return { error: fail(400, 'Could not read the request') } }
  if (text.length > maxBytes) return { error: fail(413, 'That request is too large') }
  let raw: unknown
  try { raw = JSON.parse(text) } catch { return { error: fail(400, 'The request was not valid JSON') } }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return { error: fail(400, 'Some of what was sent is not valid') }
  return { data: parsed.data }
}

/** An unexpected failure: the real reason goes to the server logs, the browser gets a plain sentence. */
export function serverError(label: string, e: unknown, message = 'Something went wrong on our side. Please try again.') {
  console.error(label, e)
  return fail(500, message)
}
