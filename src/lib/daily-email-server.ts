// ──────────────────────────────────────────────────────────
//  The daily email job (server only: it uses the all-seeing database key, so it must never be imported by a screen). Once a day it
//    1. emails each person the things that need them (lib/digest.ts), and
//    2. emails the outside people named on a contract as its key dates come up (lib/contract-reminders.ts).
//  All the rules about WHO gets WHAT are in those two pure files and their checks; this file only fetches the data and sends.
//
//  Safety, in the order it matters:
//    · Off unless email is set up (RESEND_API_KEY + EMAIL_FROM); with it off nothing is read and nothing is sent.
//    · Reminders to OUTSIDE people are a second switch (CONTRACT_REMINDERS_ON=1), because they go to strangers: each carries a one-click
//      "stop these emails" link, never a subject someone else wrote, and is capped per company, per address per week, and per run.
//    · A dry run does everything except send and record, and says only HOW MANY (never who or what).
//    · Every email is recorded in `email_log` BEFORE it is sent (the key is unique), so a repeat run, an overlapping run or a retry can
//      never send twice; if the send fails the record is removed so the next run tries again. If the log cannot be written, nothing is sent.
//    · Every read is scoped to one company and goes a page at a time (lib/workspace-server-load.ts); if the access rules cannot be read in
//      full, that company's people are emailed nothing.
//    · A person who switched the morning email off, has never signed in, is banned, or has not confirmed their address gets nothing.
//    · Hard limits per run (emails, time, a run of failures in a row) so a mistake cannot become a flood.
//    · Nothing here logs an address, a name or a title.
// ──────────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import type { AccessGrant } from '@/lib/db'
import { digestFor, renderDigest, type DigestRecipient } from '@/lib/digest'
import { remindersDue } from '@/lib/contract-reminders'
import { emailConfig, mayEmail, sendEmail, type Email, type EmailResult } from '@/lib/email'
import { unsubscribeUrl } from '@/lib/email-unsubscribe'
import { fetchAllRows, loadWorkspaceDataServer } from '@/lib/workspace-server-load'
import type { InboxChoice } from '@/lib/inbox'
import type { ItemException, ItemEffect, ItemType } from '@/lib/item-access'
import type { Client, UserRole } from '@/types'

/** Morning emails in one run (all companies together). */
export const MAX_SENDS = 300
/** Reminders to outside people in one run (all companies together), and from any one company. */
export const MAX_CONTRACT_SENDS = 100
export const MAX_CONTRACT_PER_COMPANY = 25
/** The most emails one outside address gets in a week, from every company together. */
export const MAX_CONTRACT_PER_ADDRESS_WEEK = 3
/** The job stops sending after this many failures in a row (something is wrong; do not hammer it), and after this long (the function has 60 seconds). */
export const STOP_AFTER_FAILURES = 5
export const TIME_LIMIT_MS = 50_000
/** The log is only needed while a date can still come round again; older rows are tidied away. */
export const LOG_KEEP_DAYS = 400
const SITE = 'https://www.mgmtpath.com'
const DAY_MS = 86_400_000

type Admin = ReturnType<typeof createAdminClient>
type Counts = Record<string, number>
export interface DailyEmailSummary {
  dryRun: boolean
  emailOn: boolean
  remindersOn: boolean            // the second switch, for emails to outside people
  logReady: boolean               // the sent-email log can be read (false until its migration is applied: then a real run would send nothing)
  morning: { people: number; due: number; sent: number; skipped: Counts }
  contracts: { due: number; sent: number; skipped: Counts }
}

const bump = (c: Counts, k: string, by = 1) => { c[k] = (c[k] ?? 0) + by }

/** The site's address for links in emails: APP_URL when it is a proper web address, otherwise our own site. */
export function appUrlFrom(env: Record<string, string | undefined> = process.env): string {
  const v = env.APP_URL?.trim()
  return (v && /^https?:\/\/[^\s/]+/i.test(v) ? v : SITE).replace(/\/+$/, '')
}

/** Records "this email is going out". 'already' means it was sent before; 'error' means we cannot be sure, so it must not be sent. */
async function claim(admin: Admin, key: string, kind: 'morning' | 'contract', recipient: string | null): Promise<'claimed' | 'already' | 'error'> {
  const { error } = await admin.from('email_log').insert({ key, kind, recipient })
  if (!error) return 'claimed'
  return error.code === '23505' ? 'already' : 'error'
}
const release = (admin: Admin, key: string) => admin.from('email_log').delete().eq('key', key)

/** The outside world, so the checks can stand in for it. */
export interface Deps {
  admin: Admin
  load: (workspaceId: string, admin: Admin) => Promise<{ clients: Client[] }>
  send: (msg: Email) => Promise<EmailResult>
}

export async function runDailyEmails(opts: { dryRun?: boolean; now?: Date } = {}, deps: Partial<Deps> = {}, env: Record<string, string | undefined> = process.env): Promise<DailyEmailSummary> {
  const dryRun = !!opts.dryRun
  const now = opts.now ?? new Date()
  const startedAt = Date.now()
  const day = now.toISOString().slice(0, 10)
  const appUrl = appUrlFrom(env)
  const remindersOn = env.CONTRACT_REMINDERS_ON === '1'
  const summary: DailyEmailSummary = {
    dryRun, emailOn: !!emailConfig(env), remindersOn, logReady: false,
    morning: { people: 0, due: 0, sent: 0, skipped: {} }, contracts: { due: 0, sent: 0, skipped: {} },
  }
  if (!summary.emailOn && !dryRun) return summary          // off: read nothing, send nothing

  const admin = deps.admin ?? createAdminClient()
  const load = deps.load ?? loadWorkspaceDataServer
  const send = deps.send ?? ((m: Email) => sendEmail(m, env))
  const budget = { morning: MAX_SENDS, contract: MAX_CONTRACT_SENDS }
  let failStreak = 0

  // Is the sent-email log there? (Before its migration is applied a real run could not record anything, so it would send nothing.)
  summary.logReady = !(await admin.from('email_log').select('key').limit(1)).error
  // Tidy away old log rows.
  if (!dryRun && summary.logReady) await admin.from('email_log').delete().lt('sent_at', new Date(now.getTime() - LOG_KEEP_DAYS * DAY_MS).toISOString())

  /** Sends one recorded email. Returns what happened, for the counts. */
  async function deliver(kind: 'morning' | 'contract', key: string, msg: Email, recipient: string | null): Promise<string> {
    const may = mayEmail(msg.to, env)
    if (!may.ok) return may.reason === 'bad-address' ? 'failed' : may.reason
    if (dryRun) return 'dry'
    if (failStreak >= STOP_AFTER_FAILURES || Date.now() - startedAt > TIME_LIMIT_MS) return 'stopped'
    if (budget[kind] <= 0) return 'limit'
    const c = await claim(admin, key, kind, recipient)
    if (c === 'already') return 'already'
    if (c === 'error') return 'failed'
    budget[kind]--
    const res = await send({ ...msg, key })
    if (res.ok) { failStreak = 0; return 'sent' }
    failStreak++
    await release(admin, key)
    return 'failed'
  }

  const { data: workspaces, error: wsError } = await admin.from('workspaces').select('id, name')
  if (wsError) { console.error('Daily email: could not list companies'); return summary }

  for (const ws of (workspaces ?? []) as { id: string; name: string | null }[]) {
    try {
      const company = ws.name?.trim() ?? ''
      const { clients } = await load(ws.id, admin)
      if (clients.length === 0) continue

      // ── 1. the morning email, per person ──
      const members = await fetchAllRows(admin, 'workspace_members', 'workspace_id', [ws.id], [{ col: 'id' }], 'id, user_id, role, client_id')
      const people = (members as { id: string; user_id: string; role: UserRole; client_id: string | null }[]).filter(m => m.client_id === null)
      if (people.length > 0) {
        const memberIds = people.map(p => p.id), userIds = people.map(p => p.user_id), clientIds = clients.map(c => c.id)
        // If any of these cannot be read IN FULL, the company is skipped (the catch below): never guess who may see what.
        const [grantRows, exceptionRows, choiceRows, prefRows] = await Promise.all([
          fetchAllRows(admin, 'access_grants', 'workspace_member_id', memberIds, [{ col: 'id' }], 'workspace_member_id, section, client_id, can_edit'),
          fetchAllRows(admin, 'item_access', 'client_id', clientIds, [{ col: 'id' }], 'id, client_id, item_type, item_id, member_id, effect'),
          fetchAllRows(admin, 'inbox_state', 'user_id', userIds, [{ col: 'user_id' }, { col: 'item_key' }], 'user_id, item_key, state, until'),
          fetchAllRows(admin, 'email_prefs', 'user_id', userIds, [{ col: 'user_id' }], 'user_id, morning_email'),
        ])
        const grantsBy = new Map<string, AccessGrant[]>()
        for (const g of grantRows as { workspace_member_id: string; section: string; client_id: string | null; can_edit: boolean }[]) {
          const list = grantsBy.get(g.workspace_member_id) ?? []
          list.push({ section: g.section, clientId: g.client_id, canEdit: g.can_edit }); grantsBy.set(g.workspace_member_id, list)
        }
        const exceptions: ItemException[] = (exceptionRows as { id: string; client_id: string; item_type: string; item_id: string; member_id: string; effect: string }[])
          .map(r => ({ id: r.id, clientId: r.client_id, itemType: r.item_type as ItemType, itemId: r.item_id, memberId: r.member_id, effect: r.effect as ItemEffect }))
        const choicesBy = new Map<string, Record<string, InboxChoice>>()
        for (const r of choiceRows as { user_id: string; item_key: string; state: string; until: string | null }[]) {
          const m = choicesBy.get(r.user_id) ?? {}
          m[r.item_key] = { state: r.state as InboxChoice['state'], until: r.until ?? undefined }; choicesBy.set(r.user_id, m)
        }
        const off = new Set((prefRows as { user_id: string; morning_email: boolean }[]).filter(p => !p.morning_email).map(p => p.user_id))

        // To-dos given to people recently, and which of those they were already told about.
        const recent = now.getTime() - 4 * DAY_MS
        const todoKeys = clients.flatMap(c => (c.tasks ?? []).filter(t => t.assigneeId && !t.doneAt && Date.parse(t.createdAt) >= recent).map(t => `todo:${t.assigneeId}:${t.id}`))
        const toldKeys = new Set((await fetchAllRows(admin, 'email_log', 'key', todoKeys, [{ col: 'key' }], 'key')).map(r => r.key as string))

        for (const p of people) {
          summary.morning.people++
          if (off.has(p.user_id)) { bump(summary.morning.skipped, 'switched-off'); continue }
          const { data: u } = await admin.auth.admin.getUserById(p.user_id)
          const user = u?.user
          const email = user?.email?.toLowerCase()
          const banned = !!user?.banned_until && Date.parse(user.banned_until) > now.getTime()
          if (!email || !user?.last_sign_in_at || !user.email_confirmed_at || banned) { bump(summary.morning.skipped, 'no-login-yet'); continue }
          const recipient: DigestRecipient = { memberId: p.id, userId: p.user_id, role: p.role, clientId: null, grants: grantsBy.get(p.id) ?? [] }
          const announced = new Set(clients.flatMap(c => (c.tasks ?? []).filter(t => toldKeys.has(`todo:${p.user_id}:${t.id}`)).map(t => t.id)))
          const content = digestFor(recipient, clients, { exceptions, choices: choicesBy.get(p.user_id) ?? {}, today: day, now: now.getTime(), announced })
          if (!content) { bump(summary.morning.skipped, 'nothing-today'); continue }
          summary.morning.due++
          const mail = renderDigest(content, { appUrl, company })
          const result = await deliver('morning', `morning:${p.user_id}:${ws.id}:${day}`, { to: email, subject: mail.subject, text: mail.text, html: mail.html }, null)
          if (result === 'sent') {
            summary.morning.sent++
            // Remember which to-dos this told them about, so tomorrow does not say it again (if this fails the worst case is hearing it twice).
            for (const id of mail.announcedTaskIds) await admin.from('email_log').insert({ key: `todo:${p.user_id}:${id}`, kind: 'todo', recipient: null })
          } else if (result !== 'dry') bump(summary.morning.skipped, result)
        }
      }

      // ── 2. contract reminders to outside people ──
      const reminders = remindersDue(clients, day, company, a => unsubscribeUrl(appUrl, a, env) ?? '')
      if (reminders.length > 0) {
        summary.contracts.due += reminders.length
        if (!remindersOn) { bump(summary.contracts.skipped, 'not-turned-on', reminders.length); continue }
        const addresses = [...new Set(reminders.map(r => r.to))]
        const weekAgo = now.getTime() - 7 * DAY_MS
        const [suppressedRows, loggedRows] = await Promise.all([
          fetchAllRows(admin, 'email_suppressions', 'address', addresses, [{ col: 'address' }], 'address'),
          fetchAllRows(admin, 'email_log', 'recipient', addresses, [{ col: 'sent_at', desc: true }, { col: 'key' }], 'recipient, kind, sent_at'),
        ])
        const stopped = new Set(suppressedRows.map(r => r.address as string))
        const thisWeek = new Map<string, number>()
        for (const r of loggedRows as { recipient: string; kind: string; sent_at: string }[]) {
          if (r.kind === 'contract' && Date.parse(r.sent_at) >= weekAgo) thisWeek.set(r.recipient, (thisWeek.get(r.recipient) ?? 0) + 1)
        }
        let fromThisCompany = 0
        for (const r of reminders) {
          if (!r.unsubscribeUrl) { bump(summary.contracts.skipped, 'no-stop-link'); continue }
          if (stopped.has(r.to)) { bump(summary.contracts.skipped, 'stopped-by-them'); continue }
          if ((thisWeek.get(r.to) ?? 0) >= MAX_CONTRACT_PER_ADDRESS_WEEK) { bump(summary.contracts.skipped, 'too-many-this-week'); continue }
          if (fromThisCompany >= MAX_CONTRACT_PER_COMPANY) { bump(summary.contracts.skipped, 'company-limit'); continue }
          const result = await deliver('contract', r.key, { to: r.to, subject: r.subject, text: r.text, html: r.html, unsubscribeUrl: r.unsubscribeUrl }, r.to)
          if (result === 'sent') { summary.contracts.sent++; fromThisCompany++; thisWeek.set(r.to, (thisWeek.get(r.to) ?? 0) + 1) }
          else if (result !== 'dry') bump(summary.contracts.skipped, result)
          else fromThisCompany++
        }
      }
    } catch (e) {
      console.error('Daily email: a company was skipped:', e instanceof Error ? e.name : 'error')
    }
  }
  return summary
}
