// ──────────────────────────────────────────────────────────
//  Reminders about a contract's key dates, emailed to the people who were named on the contract (a lawyer, an assistant), who do not
//  need a login. Pure logic (no network, no store), covered by scripts/check-contract-reminders.ts.
//
//  One email is due at each milestone — 90, 30 and 7 days before the date that matters — and a milestone is only ever sent once per
//  contract date and address (the caller records the key). A milestone that was missed (nobody ran the job that day) is still sent the
//  next day, once, as long as the date has not passed. Past dates send nothing. The email says what the date is, never what the deal
//  pays or says: no fees, terms or files, only the artist, the contract's name, who it is with, and the date.
// ──────────────────────────────────────────────────────────

import type { Client, Contract } from '@/types'
import { currentTermEnd, dateWord, noticeInfo } from '@/lib/contract-dates'
import { daysUntil } from '@/lib/date-state'
import { esc, looksLikeEmail, plainLine } from '@/lib/email-address'

export const REMINDER_MILESTONES = [90, 30, 7] as const
export type Milestone = (typeof REMINDER_MILESTONES)[number]
export const MAX_REMINDER_ADDRESSES = 5

/** Addresses typed into a box, separated by commas, semicolons, spaces or lines: the good ones (lower case, no repeats), and the ones that are not addresses. */
export function parseAddresses(text: string): { emails: string[]; bad: string[] } {
  const emails: string[] = [], bad: string[] = []
  const bare = text.replace(/"[^"]*"\s*(?=<)/g, ' ').replace(/[^,;\n<>]*<([^<>\s]+)>/g, ' $1 ')   // "Jane Doe <jane@firm.com>" and "Doe, Jane" <jane@firm.com> are jane@firm.com
  for (const raw of bare.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)) {
    const e = raw.toLowerCase()
    if (!looksLikeEmail(e)) { bad.push(raw); continue }
    if (!emails.includes(e)) emails.push(e)
  }
  return { emails, bad }
}

export type DateKind = 'notice' | 'renewal' | 'end'

export interface KeyDate { date: string; daysLeft: number; kind: DateKind }

/**
 * The next date worth a reminder on a signed contract, or null: the last day to give notice when it has a notice period, otherwise the
 * day it renews (automatic renewal) or ends. Dates that have passed give nothing.
 */
export function keyDateFor(c: Contract, today: string): KeyDate | null {
  if (c.status !== 'signed') return null
  const n = noticeInfo(c, today)
  if (n) return n.passed ? null : { date: n.deadline, daysLeft: n.daysLeft, kind: 'notice' }
  const end = currentTermEnd(c, today)
  if (!end) return null
  const daysLeft = daysUntil(end, today)
  return daysLeft < 0 ? null : { date: end, daysLeft, kind: c.autoRenews ? 'renewal' : 'end' }
}

/** Which reminder the date has reached: 7 once it is within a week, 30 within a month, 90 within three months, none further away. */
export function milestoneFor(daysLeft: number): Milestone | null {
  if (daysLeft < 0 || daysLeft > 90) return null
  return daysLeft <= 7 ? 7 : daysLeft <= 30 ? 30 : 90
}

export interface ContractReminder {
  key: string                  // recorded once sent, so it is never sent twice
  to: string
  subject: string
  text: string
  html: string
  unsubscribeUrl?: string      // one click stops these emails for this address
}

const WHAT: Record<DateKind, { short: string; line: (date: string) => string }> = {
  notice: { short: 'notice date', line: d => `The last day to give notice is ${d}. After that the contract carries on as written (it may renew by itself).` },
  renewal: { short: 'renewal', line: d => `The contract renews on ${d}.` },
  end: { short: 'end date', line: d => `The contract ends on ${d}.` },
}

const inDays = (n: number) => (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`)

/** The subject never carries anyone's words: these go to people outside the company, who must not be handed a line somebody else wrote. */
export const REMINDER_SUBJECT = 'A contract date is coming up'

function write(o: { company: string; artist: string; c: Contract; k: KeyDate; unsubscribeUrl?: string }): Pick<ContractReminder, 'subject' | 'text' | 'html'> {
  const d = dateWord(o.k.date)
  const title = plainLine(o.c.title, 120), counterparty = plainLine(o.c.counterparty, 80), artist = plainLine(o.artist, 60), company = plainLine(o.company, 60)
  const line = `${WHAT[o.k.kind].line(d)} That is ${inDays(o.k.daysLeft)}.`
  const who = company || 'a Mgmt Path customer'
  const why = `You are getting this because ${who} added your address to a contract's reminders in Mgmt Path. If that is a mistake, use the link below and these emails stop.`
  const text = [`${title} (${artist}, with ${counterparty})`, line, '', why, ...(o.unsubscribeUrl ? [`Stop these emails: ${o.unsubscribeUrl}`] : [])].join('\n')
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f1d1a;max-width:560px;margin:0 auto;padding:16px">` +
    `<h2 style="margin:0 0 8px;font-size:17px">${esc(title)}</h2>` +
    `<p style="margin:0 0 4px;color:#6b665e">${esc(artist)} · with ${esc(counterparty)}</p>` +
    `<p style="margin:12px 0">${esc(WHAT[o.k.kind].line(d))} <strong>That is ${esc(inDays(o.k.daysLeft))}.</strong></p>` +
    `<p style="margin:16px 0 0;font-size:12px;color:#8a857b">${esc(why)}</p>` +
    (o.unsubscribeUrl ? `<p style="margin:6px 0 0;font-size:12px"><a href="${esc(o.unsubscribeUrl)}" style="color:#8a857b">Stop these emails</a></p>` : '') +
    `</div>`
  return { subject: REMINDER_SUBJECT, text, html }
}

/** Every reminder due today across these artists. `company` is the name used in the email's footer (leave it empty when the company has no name). Practice (demo) artists send nothing. */
export function remindersDue(clients: Client[], today: string, company: string, unsubscribeFor?: (address: string) => string): ContractReminder[] {
  const out: ContractReminder[] = []
  for (const client of clients) {
    if (client.isDemo) continue
    for (const c of client.legal?.contracts ?? []) {
      const addresses = [...new Set((c.reminderEmails ?? []).map(e => e.trim().toLowerCase()))].filter(looksLikeEmail).slice(0, MAX_REMINDER_ADDRESSES)
      if (addresses.length === 0) continue
      const k = keyDateFor(c, today)
      const m = k && milestoneFor(k.daysLeft)
      if (!k || !m) continue
      for (const to of addresses) {
        const unsubscribeUrl = unsubscribeFor?.(to)
        out.push({ key: `contract:${c.id}:${k.date}:${m}:${to}`, to, ...(unsubscribeUrl ? { unsubscribeUrl } : {}), ...write({ company, artist: client.name, c, k, unsubscribeUrl }) })
      }
    }
  }
  return out
}
