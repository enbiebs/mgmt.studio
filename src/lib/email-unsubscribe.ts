// The "stop these emails" link in every email to an outside person. The link carries the address and a signature only our server can make
// (a keyed hash of the address), so nobody can stop mail for an address they cannot already see mail for. Server only (it uses the
// server's secret key and Node's crypto); never import it from a screen.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { looksLikeEmail } from '@/lib/email-address'

const secretOf = (env: Record<string, string | undefined>) => env.UNSUBSCRIBE_SECRET?.trim() || env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''

/** The signature for an address (empty when the server has no secret, so no link can be made or accepted). */
export function unsubscribeToken(address: string, env: Record<string, string | undefined> = process.env): string {
  const secret = secretOf(env)
  return secret ? createHmac('sha256', secret).update(`unsubscribe:${address.trim().toLowerCase()}`).digest('hex') : ''
}

/** The link to put in an email. `appUrl` has no trailing slash. */
export function unsubscribeUrl(appUrl: string, address: string, env: Record<string, string | undefined> = process.env): string | null {
  const token = unsubscribeToken(address, env)
  return token ? `${appUrl}/api/email/unsubscribe?a=${encodeURIComponent(address.trim().toLowerCase())}&t=${token}` : null
}

/** Is this the link we made for this address? Returns the clean address when it is. */
export function checkUnsubscribe(address: unknown, token: unknown, env: Record<string, string | undefined> = process.env): string | null {
  if (typeof address !== 'string' || typeof token !== 'string') return null
  const a = address.trim().toLowerCase()
  const want = unsubscribeToken(a, env)
  if (!want || !looksLikeEmail(a) || token.length !== want.length) return null
  return timingSafeEqual(Buffer.from(token), Buffer.from(want)) ? a : null
}
