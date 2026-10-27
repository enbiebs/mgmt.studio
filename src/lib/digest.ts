// ──────────────────────────────────────────────────────────
//  The morning email: what needs one person today, written down. Pure logic (no network, no store) so the rules are tested on their own.
//
//  The one rule that matters: a person is emailed ONLY about what they may see in the app. That is worked out here the same way the app does
//  it for "preview as" (filterClientForViewer, then the Inbox rules with the person's own section access), and deliberately on the cautious
//  side: a section counts only when the person holds the grant for it (a single item shared with them does not open the alerts for its section),
//  the artist's own login gets nothing, and practice (demo) artists are left out. Nothing is stored; every morning is worked out fresh.
//
//  The email is sent only when something needs the person: an alert that needs action (urgent or coming up, not heads-ups) that they have not
//  marked done or snoozed, or a to-do given to them that is new or due. Nothing to do means no email.
// ──────────────────────────────────────────────────────────

import type { Client, Task, UserRole } from '@/types'
import { buildInbox, inboxAccessFor, isHidden, SEVERITY_LABEL, type InboxChoice, type InboxItem } from '@/lib/inbox'
import { filterClientForViewer, hasSectionGrant, type ItemException, type Viewer } from '@/lib/item-access'
import type { AccessGrant } from '@/lib/db'
import { addDays } from '@/lib/utils'
import { esc } from '@/lib/email-address'
import { PRODUCT_NAME } from '@/lib/brand'
import { dateWord } from '@/lib/contract-dates'

/** A login that may get the email: who they are, their role and every section grant they hold. */
export interface DigestRecipient {
  memberId: string
  userId: string
  role: UserRole
  clientId: string | null          // set only for an artist's own login
  grants: AccessGrant[]
}

export const viewerOf = (r: DigestRecipient): Viewer => ({ memberId: r.memberId, role: r.role, clientId: r.clientId, grants: r.grants, userId: r.userId })

/** The artists this person may look at: all of them for a manager, otherwise those named by a grant (or every artist for a company-wide grant). */
export function clientsOf(r: DigestRecipient, clients: Client[]): Client[] {
  if (r.role === 'artist') return []
  return clients.filter(c => !c.isDemo && (r.role === 'manager' || r.grants.some(g => g.clientId === null || g.clientId === c.id)))
}

/** A to-do given to someone is looked at as "new" for this long (long enough to survive a missed day); it is only ever announced ONCE, because the job records it (see `announced`). */
export const NEW_TODO_HOURS = 72
/** A to-do given to someone is worth a mention when it is due by tomorrow (or is already late). */
export const TODO_DUE_DAYS = 1
/** Most lines in one email; the rest are counted, not listed. */
export const MAX_LINES = 12

export interface DigestTask { task: Task; clientId: string; clientName: string; why: 'new' | 'due' }
export interface DigestContent { items: InboxItem[]; tasks: DigestTask[] }

export interface DigestContext {
  exceptions: ItemException[]                 // single items hidden from or shared with specific people
  choices: Record<string, InboxChoice>        // this person's Done / Snooze choices on alerts
  today: string                               // YYYY-MM-DD
  now: number                                 // ms since 1970 (to tell which to-dos are new)
  announced: Set<string>                      // ids of to-dos this person was already told about as "given to you" (they are not announced twice)
}

const RANK = { urgent: 0, soon: 1, info: 2 } as const

/** What this person needs today, or null when there is nothing (then no email goes out). */
export function digestFor(r: DigestRecipient, clients: Client[], ctx: DigestContext): DigestContent | null {
  if (r.role === 'artist') return null
  const viewer = viewerOf(r)
  const items: InboxItem[] = []
  const tasks: DigestTask[] = []
  const newSince = ctx.now - NEW_TODO_HOURS * 3_600_000

  for (const c of clientsOf(r, clients)) {
    const seen = filterClientForViewer(c, viewer, ctx.exceptions)
    // Cautious on purpose: only sections the person holds a grant for (never "a single item was shared with me").
    const access = inboxAccessFor((section, id) => hasSectionGrant(viewer, section, id), () => false, c.id)
    for (const i of buildInbox(seen, ctx.today, access)) {
      if (i.demo || i.severity === 'info' || isHidden(ctx.choices[i.key], ctx.today)) continue
      items.push(i)
    }
    for (const t of seen.tasks ?? []) {
      if (t.doneAt || t.assigneeId !== r.userId) continue
      const given = !!t.createdBy && t.createdBy !== r.userId && Date.parse(t.createdAt) >= newSince && !ctx.announced.has(t.id)
      const due = !!t.dueDate && t.dueDate <= addDays(ctx.today, TODO_DUE_DAYS)
      if (given || due) tasks.push({ task: t, clientId: c.id, clientName: c.name, why: given ? 'new' : 'due' })
    }
  }

  if (items.length === 0 && tasks.length === 0) return null
  items.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.date ?? '').localeCompare(b.date ?? ''))
  tasks.sort((a, b) => (a.task.dueDate ?? '9999').localeCompare(b.task.dueDate ?? '9999'))
  return { items, tasks }
}

// ── Writing it ──────────────────────────────────────────────

export interface DigestText {
  subject: string; text: string; html: string
  /** The to-dos this email announces as "given to you": record them so the next morning does not say it again. */
  announcedTaskIds: string[]
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

interface Group { clientId: string; clientName: string; lines: { tag: string; title: string; detail?: string }[] }

/** The email for one person, from what digestFor found. `appUrl` has no trailing slash. */
export function renderDigest(c: DigestContent, o: { appUrl: string; company?: string }): DigestText {
  const total = c.items.length + c.tasks.length
  const groups = new Map<string, Group>()
  const group = (id: string, name: string) => { let g = groups.get(id); if (!g) { g = { clientId: id, clientName: name, lines: [] }; groups.set(id, g) } return g }

  let shown = 0
  const announcedTaskIds: string[] = []
  for (const i of c.items) {
    if (shown >= MAX_LINES) break
    group(i.clientId, i.clientName).lines.push({ tag: SEVERITY_LABEL[i.severity], title: i.title, detail: i.detail }); shown++
  }
  for (const t of c.tasks) {
    if (shown >= MAX_LINES) break
    group(t.clientId, t.clientName).lines.push({ tag: t.why === 'new' ? 'Given to you' : 'To-do', title: t.task.title, detail: t.task.dueDate ? `due ${dateWord(t.task.dueDate)}` : undefined }); shown++
    if (t.why === 'new') announcedTaskIds.push(t.task.id)
  }
  const more = total - shown

  const subject = `${PRODUCT_NAME}: ${plural(total, 'thing')} for you today`
  const link = (id: string) => `${o.appUrl}/artists/${encodeURIComponent(id)}/today`
  const footer = 'You get this email only on days something needs you. To stop it, open the account menu in the app and switch off "Morning email".'

  const text = [
    `${plural(total, 'thing')} for you today${o.company ? ` at ${o.company}` : ''}.`,
    '',
    ...[...groups.values()].flatMap(g => [
      g.clientName,
      ...g.lines.map(l => `  • ${l.tag}: ${l.title}${l.detail ? ` — ${l.detail}` : ''}`),
      `  Open: ${link(g.clientId)}`,
      '',
    ]),
    ...(more > 0 ? [`…and ${plural(more, 'more thing')} in the app.`, ''] : []),
    `All your things: ${o.appUrl}/today`,
    '',
    footer,
  ].join('\n')

  const html = [
    `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1f1d1a;max-width:560px;margin:0 auto;padding:16px">`,
    `<h2 style="margin:0 0 12px;font-size:18px">${esc(plural(total, 'thing'))} for you today${o.company ? ` <span style="font-weight:400;color:#6b665e">at ${esc(o.company)}</span>` : ''}</h2>`,
    ...[...groups.values()].map(g =>
      `<div style="margin:0 0 14px"><div style="font-weight:600;margin-bottom:4px">${esc(g.clientName)}</div>` +
      `<ul style="margin:0;padding-left:18px">${g.lines.map(l => `<li style="margin:2px 0"><span style="color:#8a6d3b">${esc(l.tag)}:</span> ${esc(l.title)}${l.detail ? ` <span style="color:#6b665e">— ${esc(l.detail)}</span>` : ''}</li>`).join('')}</ul>` +
      `<a href="${esc(link(g.clientId))}" style="font-size:13px;color:#a8431f">Open ${esc(g.clientName)}</a></div>`),
    more > 0 ? `<p style="margin:0 0 12px">…and ${esc(plural(more, 'more thing'))} in the app.</p>` : '',
    `<p style="margin:0 0 16px"><a href="${esc(o.appUrl)}/today" style="color:#a8431f">See everything in ${esc(PRODUCT_NAME)}</a></p>`,
    `<p style="margin:0;font-size:12px;color:#8a857b">${esc(footer)}</p>`,
    `</div>`,
  ].join('')

  return { subject, text, html, announcedTaskIds }
}
