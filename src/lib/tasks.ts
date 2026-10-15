// ──────────────────────────────────────────────────────────
//  To-dos and the Today list. Pure logic (no store, no screen) so the daily email and the agent
//  can use the same rules later.
//
//  Today shows two kinds of rows side by side:
//    · to-dos a person wrote down (stored, given to one teammate, checked off), and
//    · the automatic "needs you" items worked out from the data (see lib/inbox.ts), which come and go
//      on their own and are never stored here.
//  Both are put into the same groups by date: Overdue, Today, This week, Later, No date.
// ──────────────────────────────────────────────────────────

import type { Client, MainSection, Project, Task, TaskLinkType, WorkspacePerson } from '@/types'
import type { InboxItem } from '@/lib/inbox'
import { addDays, fromDateStr, toDateStr } from '@/lib/utils'
import { buildKeyDates, type KeyDate } from '@/lib/key-dates'

export type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'nodate' | 'info'
export const BUCKET_ORDER: Bucket[] = ['overdue', 'today', 'week', 'later', 'nodate', 'info']
export const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: 'Overdue', today: 'Today', week: 'This week', later: 'Later', nodate: 'No date', info: 'Heads-up',
}

/** Which group a date belongs in. "This week" means the next 7 days. */
export function bucketOf(date: string | undefined, today: string): Exclude<Bucket, 'info'> {
  if (!date) return 'nodate'
  if (date < today) return 'overdue'
  if (date === today) return 'today'
  return date <= addDays(today, 7) ? 'week' : 'later'
}

const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const SHORT_MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** How a due date reads in the list: "Today", "Tomorrow", "Fri", "Oct 21", "Jan 5, 2027". */
export function dueLabel(date: string, today: string): string {
  if (date === today) return 'Today'
  if (date === addDays(today, 1)) return 'Tomorrow'
  const d = fromDateStr(date)
  if (date > today && date <= addDays(today, 6)) return SHORT_DAY[d.getDay()]
  const base = `${SHORT_MONTH[d.getMonth()]} ${d.getDate()}`
  return d.getFullYear() === fromDateStr(today).getFullYear() ? base : `${base}, ${d.getFullYear()}`
}

/** The group an automatic item goes in: what needs you now is never later than Today. */
export function autoBucket(item: InboxItem, today: string): Bucket {
  if (item.severity === 'info') return 'info'
  if (item.severity === 'urgent') return !item.date || item.date >= today ? 'today' : 'overdue'
  return item.date ? bucketOf(item.date, today) : 'week'
}

export type TodoRow =
  | { kind: 'task'; key: string; bucket: Bucket; task: Task; clientId: string; clientName: string }
  | { kind: 'project'; key: string; bucket: Bucket; project: Project; clientId: string; clientName: string }
  | { kind: 'keydate'; key: string; bucket: Bucket; keyDate: KeyDate }
  | { kind: 'auto'; key: string; bucket: Bucket; item: InboxItem }

export interface TodayInput {
  clients: Client[]
  inbox: InboxItem[]          // the automatic items still showing (not marked done or snoozed)
  me: string | null           // the signed-in login's user id
  scope: 'mine' | 'everyone'
  today: string
  canTour?: (clientId: string) => boolean   // key dates are about shows, so they need Tour access (default: yes)
}

export interface TodayList {
  groups: { bucket: Bucket; rows: TodoRow[] }[]
  done: { task: Task; clientId: string; clientName: string }[]   // checked off in the last 14 days, newest first
  needCount: number                                                // overdue + today: what to look at now
}

const DONE_WINDOW_DAYS = 14

/** Mine = given to me, or written by me and not given to anyone yet (so nothing gets lost). */
export function isMine(task: Task, me: string | null): boolean {
  if (!me) return false
  return task.assigneeId === me || (!task.assigneeId && task.createdBy === me)
}

/**
 * Whether an unfinished project belongs on this person's Today, and which group it goes in.
 * A project given to someone shows for them (and under "Everyone"). A request the artist submitted that
 * nobody has picked up yet shows for everyone, so it can't be missed; other unassigned projects show
 * only under "Everyone".
 */
export function projectBucket(p: Project, me: string | null, scope: 'mine' | 'everyone', today: string): Bucket | null {
  if (p.status === 'done') return null
  const unclaimedRequest = !p.assigneeId && p.fromArtist && p.status === 'submitted'
  if (unclaimedRequest) return p.dueDate && p.dueDate < today ? 'overdue' : 'today'
  if (scope === 'mine' && (!me || p.assigneeId !== me)) return null
  return bucketOf(p.dueDate, today)
}

export function buildToday({ clients, inbox, me, scope, today, canTour = () => true }: TodayInput): TodayList {
  const keep = (t: Task) => scope === 'everyone' || isMine(t, me)
  const rows: TodoRow[] = []
  const done: TodayList['done'] = []
  const doneAfter = addDays(today, -DONE_WINDOW_DAYS)

  for (const c of clients) {
    for (const t of c.tasks ?? []) {
      if (!keep(t)) continue
      if (t.doneAt) {
        if (t.doneAt.slice(0, 10) >= doneAfter) done.push({ task: t, clientId: c.id, clientName: c.name })
        continue
      }
      rows.push({ kind: 'task', key: `task:${t.id}`, bucket: bucketOf(t.dueDate, today), task: t, clientId: c.id, clientName: c.name })
    }
  }
  for (const c of clients) {
    for (const p of c.projects ?? []) {
      // A demo artist's sample projects never raise real reminders; only one you chose to take shows.
      if (c.isDemo && (!me || p.assigneeId !== me)) continue
      const bucket = projectBucket(p, me, scope, today)
      if (bucket) rows.push({ kind: 'project', key: `project:${p.id}`, bucket, project: p, clientId: c.id, clientName: c.name })
    }
  }
  // Key dates (the advance, the travel, the day sheet) are up for grabs: they show in both views until someone takes one.
  for (const c of clients) {
    if (!canTour(c.id)) continue
    for (const kd of buildKeyDates(c, today)) rows.push({ kind: 'keydate', key: `keydate:${kd.key}:${c.id}`, bucket: bucketOf(kd.due, today), keyDate: kd })
  }
  for (const item of inbox) rows.push({ kind: 'auto', key: `auto:${item.key}`, bucket: autoBucket(item, today), item })

  const dateOf = (r: TodoRow) => (r.kind === 'task' ? r.task.dueDate : r.kind === 'project' ? r.project.dueDate : r.kind === 'keydate' ? r.keyDate.due : r.item.date) ?? '9999-12-31'
  const titleOf = (r: TodoRow) => (r.kind === 'task' ? r.task.title : r.kind === 'project' ? r.project.title : r.kind === 'keydate' ? r.keyDate.title : r.item.title)
  const order = { auto: 0, keydate: 1, project: 2, task: 3 }
  rows.sort((a, b) =>
    dateOf(a).localeCompare(dateOf(b)) ||
    order[a.kind] - order[b.kind] ||
    titleOf(a).localeCompare(titleOf(b)))
  done.sort((a, b) => (b.task.doneAt ?? '').localeCompare(a.task.doneAt ?? ''))

  const groups = BUCKET_ORDER
    .map(bucket => ({ bucket, rows: rows.filter(r => r.bucket === bucket) }))
    .filter(g => g.rows.length > 0)
  const needCount = rows.filter(r => r.bucket === 'overdue' || r.bucket === 'today').length
  return { groups, done, needCount }
}

/** The teammates a to-do for this artist can be given to (the server enforces the same rule). Me first. */
export function peopleFor(people: WorkspacePerson[], clientId: string, me: string | null): WorkspacePerson[] {
  return people
    .filter(p => p.allClients || p.clientIds.includes(clientId))
    .sort((a, b) => Number(b.userId === me) - Number(a.userId === me) || a.label.localeCompare(b.label))
}

/** The section a to-do belongs to: what it points at, or Projects when it points at nothing. The database sets the same value. */
export function taskSection(link: Task['link']): MainSection {
  if (!link) return 'projects'
  return taskDestination(link).section
}

/** What a to-do points at, in words ("Tresor · Berlin", "INV-007", "Press photos"), or nothing if it no longer exists. */
export function describeLink(client: Client, link: NonNullable<Task['link']>): string | undefined {
  const place = (venue?: string, city?: string) => [venue, city].filter(Boolean).join(' · ') || undefined
  switch (link.type) {
    case 'show': { const x = client.tour?.shows.find(s => s.id === link.id); return x && place(x.venue, x.city) }
    case 'offer': { const x = client.agentData?.offers.find(o => o.id === link.id); return x && place(x.venue, x.city) }
    case 'invoice': { const x = client.finance?.invoices.find(i => i.id === link.id); return x && `${x.number} · ${x.to}` }
    case 'expense': { const x = client.finance?.expenses.find(e => e.id === link.id); return x && (x.vendor || x.description) }
    case 'contract': return client.legal?.contracts.find(c => c.id === link.id)?.title
    case 'project': return client.projects?.find(p => p.id === link.id)?.title
    case 'song': return client.songs?.albums.flatMap(a => a.tracks).find(t => t.id === link.id)?.title
  }
}

/** Where "Open" takes you for a to-do that points at something. */
export function taskDestination(link: NonNullable<Task['link']>): { section: MainSection; sub?: string; showId?: string } {
  const map: Record<TaskLinkType, { section: MainSection; sub?: string }> = {
    show: { section: 'tour', sub: 'tour' }, offer: { section: 'tour', sub: 'offers' },
    invoice: { section: 'finance', sub: 'invoices' }, expense: { section: 'finance', sub: 'payments' },
    contract: { section: 'legal' }, song: { section: 'songs' }, project: { section: 'projects' },
  }
  return { ...map[link.type], showId: link.type === 'show' ? link.id : undefined }
}

// ── "to-do: call the promoter friday" ───────────────────────────────────────────────────────────

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
}
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
}
const LEAD = String.raw`(?:\s+(?:by|on|before|due|until))?`

/** A real calendar date, or undefined for something like Feb 31. */
function calendarDate(year: number, month: number, day: number): string | undefined {
  const d = new Date(year, month, day)
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? toDateStr(d) : undefined
}

/** This year's date, or next year's if it has already passed. */
function upcoming(today: string, month: number, day: number): string | undefined {
  const year = fromDateStr(today).getFullYear()
  const this_ = calendarDate(year, month, day)
  if (this_ && this_ >= today) return this_
  return calendarDate(year + 1, month, day)
}

/**
 * Pulls a due date off the end of what someone typed: "today", "tomorrow", a weekday (the next one,
 * never today), "next week" (the coming Monday), "in 3 days", "in 2 weeks", "10/21", "Oct 21".
 * Anything else is left as part of the title.
 */
export function parseQuickTodo(raw: string, today: string): { title: string; dueDate?: string } {
  const text = raw.replace(/\s+/g, ' ').trim()
  const tidy = (s: string) => s.replace(/[\s,;:\-–—]+$/, '').trim()
  const result = (rest: string, dueDate: string | undefined) => {
    const title = tidy(rest)
    return title && dueDate ? { title, dueDate } : { title: text }
  }
  const weekday = fromDateStr(today).getDay()
  let m: RegExpMatchArray | null

  if ((m = text.match(new RegExp(`${LEAD}\\s+(today|tonight)$`, 'i')))) return result(text.slice(0, m.index), today)
  if ((m = text.match(new RegExp(`${LEAD}\\s+(tomorrow|tmrw)$`, 'i')))) return result(text.slice(0, m.index), addDays(today, 1))
  if ((m = text.match(new RegExp(`${LEAD}\\s+next week$`, 'i')))) return result(text.slice(0, m.index), addDays(today, ((8 - weekday) % 7) || 7))
  if ((m = text.match(new RegExp(`${LEAD}\\s+in (\\d{1,3}) (day|days|week|weeks)$`, 'i')))) {
    const n = Number(m[1]) * (m[2].toLowerCase().startsWith('week') ? 7 : 1)
    return result(text.slice(0, m.index), n > 0 ? addDays(today, n) : undefined)
  }
  if ((m = text.match(new RegExp(`${LEAD}\\s+(?:next\\s+)?(${Object.keys(WEEKDAYS).join('|')})$`, 'i')))) {
    const ahead = ((WEEKDAYS[m[1].toLowerCase()] - weekday + 7) % 7) || 7
    return result(text.slice(0, m.index), addDays(today, ahead))
  }
  if ((m = text.match(new RegExp(`${LEAD}\\s+(\\d{1,2})/(\\d{1,2})$`)))) {
    return result(text.slice(0, m.index), upcoming(today, Number(m[1]) - 1, Number(m[2])))
  }
  if ((m = text.match(new RegExp(`${LEAD}\\s+(${Object.keys(MONTHS).join('|')})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?$`, 'i')))) {
    return result(text.slice(0, m.index), upcoming(today, MONTHS[m[1].toLowerCase()], Number(m[2])))
  }
  return { title: text }
}

/** Words that mean "make this a to-do" when typed at the start of the ⌘K bar. */
export function todoPrefix(query: string): string | null {
  const m = query.match(/^\s*(?:to-?do|task|remind me to|add a to-?do)\s*[:\-–]?\s+(\S.*)$/i)
  return m ? m[1].trim() : null
}
