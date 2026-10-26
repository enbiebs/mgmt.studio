// Sending email, in one place. Off until a key and a "from" address are set in the server's environment, so merging this changes
// nothing by itself: no key, no email. Uses Resend's HTTP interface with plain fetch (no new package).
//
//   RESEND_API_KEY   the sending key                       (server only; never sent to the browser)
//   EMAIL_FROM       "Mgmt Path <notices@your-domain>"     (the domain must be verified with Resend first)
//   EMAIL_ONLY_TO    optional, comma-separated: when set, mail goes ONLY to these addresses (everyone else is skipped). For trying it out.

import { looksLikeEmail } from '@/lib/email-address'

export interface Email {
  to: string; subject: string; text: string; html: string
  /** Sent to the mail service so that sending the same email twice (a retry after an unclear failure) is only ever delivered once. */
  key?: string
  /** For email to outside people: a one-click way to stop them, shown by mail programs as an "Unsubscribe" button. */
  unsubscribeUrl?: string
}

export type EmailResult =
  | { ok: true }
  | { ok: false; reason: 'off' | 'not-allowed' | 'bad-address' | 'failed' }

type Env = Record<string, string | undefined>

/** A mail service that does not answer in this time is treated as failed (a hung call must not hold the whole job). */
export const SEND_TIMEOUT_MS = 10_000

/** The sending settings, or null when email is not set up (so nothing is sent). */
export function emailConfig(env: Env = process.env): { key: string; from: string; onlyTo: string[] | null } | null {
  const key = env.RESEND_API_KEY?.trim(), from = env.EMAIL_FROM?.trim()
  if (!key || !from) return null
  const only = (env.EMAIL_ONLY_TO ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return { key, from, onlyTo: only.length > 0 ? only : null }
}

/** Would this address get mail right now? (Email set up, address well formed, and inside the try-out list when there is one.) */
export function mayEmail(to: string, env: Env = process.env): EmailResult {
  const cfg = emailConfig(env)
  if (!cfg) return { ok: false, reason: 'off' }
  if (!looksLikeEmail(to)) return { ok: false, reason: 'bad-address' }
  if (cfg.onlyTo && !cfg.onlyTo.includes(to.toLowerCase())) return { ok: false, reason: 'not-allowed' }
  return { ok: true }
}

/** Sends one email. Never throws: the answer says what happened (the caller records "sent" only on ok). */
export async function sendEmail(msg: Email, env: Env = process.env, doFetch: typeof fetch = fetch): Promise<EmailResult> {
  const may = mayEmail(msg.to, env)
  if (!may.ok) return may
  const cfg = emailConfig(env)!
  try {
    const res = await doFetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json', ...(msg.key ? { 'Idempotency-Key': msg.key.slice(0, 256) } : {}) },
      body: JSON.stringify({
        from: cfg.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html,
        ...(msg.unsubscribeUrl ? { headers: { 'List-Unsubscribe': `<${msg.unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    })
    if (!res.ok) { console.error('Email not sent: the provider answered', res.status); return { ok: false, reason: 'failed' } }
    return { ok: true }
  } catch (e) {
    console.error('Email not sent:', e instanceof Error ? e.name : 'error')
    return { ok: false, reason: 'failed' }
  }
}
