// Checks the to-do logic (grouping, whose list, quick-add words).  Run with:  npx tsx scripts/check-tasks.ts
import assert from 'node:assert/strict'
import { BUCKET_ORDER, autoBucket, bucketOf, buildToday, describeLink, dueLabel, isMine, parseQuickTodo, peopleFor, projectBucket, taskDestination, taskSection, todoPrefix } from '../src/lib/tasks'
import type { InboxItem } from '../src/lib/inbox'
import type { Client, Project, Task, WorkspacePerson } from '../src/types'

const TODAY = '2026-10-14'   // a Wednesday

// ── grouping by date ──
assert.equal(bucketOf(undefined, TODAY), 'nodate')
assert.equal(bucketOf('2026-10-13', TODAY), 'overdue')
assert.equal(bucketOf('2026-10-14', TODAY), 'today')
assert.equal(bucketOf('2026-10-15', TODAY), 'week')
assert.equal(bucketOf('2026-10-21', TODAY), 'week')    // 7 days out is still "this week"
assert.equal(bucketOf('2026-10-22', TODAY), 'later')

const auto = (severity: InboxItem['severity'], date?: string): InboxItem =>
  ({ key: `k-${severity}-${date}`, clientId: 'c1', clientName: 'A', rule: 'invoice', severity, title: `t-${severity}-${date ?? 'none'}`, date, go: { section: 'finance' } })
assert.equal(autoBucket(auto('urgent', '2026-10-10'), TODAY), 'overdue')
assert.equal(autoBucket(auto('urgent', '2026-10-30'), TODAY), 'today')      // needs you now is never "later"
assert.equal(autoBucket(auto('urgent'), TODAY), 'today')
assert.equal(autoBucket(auto('soon', '2026-10-16'), TODAY), 'week')
assert.equal(autoBucket(auto('soon', '2026-11-30'), TODAY), 'later')
assert.equal(autoBucket(auto('soon'), TODAY), 'week')
assert.equal(autoBucket(auto('info', '2026-10-10'), TODAY), 'info')

// ── whose list ──
const ME = 'user-me', SAM = 'user-sam'
const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, source: 'manual', createdAt: '2026-10-01T00:00:00Z', ...extra })
assert.ok(isMine(task('a', { assigneeId: ME }), ME))
assert.ok(!isMine(task('a', { assigneeId: SAM, createdBy: ME }), ME))           // given to someone else: theirs
assert.ok(isMine(task('a', { createdBy: ME }), ME))                              // written by me, given to nobody: still mine
assert.ok(!isMine(task('a', { createdBy: SAM }), ME))
assert.ok(!isMine(task('a', { assigneeId: ME }), null))

const client = (id: string, name: string, tasks: Task[]) => ({ id, name, tasks }) as unknown as Client
const clients = [
  client('c1', 'Alpha', [
    task('over', { assigneeId: ME, dueDate: '2026-10-10' }),
    task('now', { assigneeId: ME, dueDate: TODAY }),
    task('sams', { assigneeId: SAM, dueDate: TODAY }),
    task('nodate', { assigneeId: ME }),
    task('done-new', { assigneeId: ME, doneAt: '2026-10-13T12:00:00Z' }),
    task('done-old', { assigneeId: ME, doneAt: '2026-09-01T12:00:00Z' }),
  ]),
  client('c2', 'Beta', [task('later', { assigneeId: ME, dueDate: '2026-12-01' }), task('unowned', { createdBy: ME })]),
  client('c3', 'Gamma', [] as Task[]),
]
const mine = buildToday({ clients, inbox: [auto('urgent', '2026-10-12'), auto('info')], me: ME, scope: 'mine', today: TODAY })
const idsIn = (b: string) => mine.groups.find(g => g.bucket === b)?.rows.map(r => (r.kind === 'task' ? r.task.id : r.kind === 'project' ? r.project.id : r.item.title)) ?? []
assert.deepEqual(idsIn('overdue').sort(), ['over', 't-urgent-2026-10-12'])
assert.deepEqual(idsIn('today'), ['now'])
assert.deepEqual(idsIn('later'), ['later'])
assert.deepEqual(idsIn('nodate').sort(), ['nodate', 'unowned'])
assert.deepEqual(idsIn('info'), ['t-info-none'])
assert.ok(!idsIn('today').includes('sams'))                                       // Sam's to-do is not on my list
assert.deepEqual(mine.done.map(d => d.task.id), ['done-new'])                     // checked off recently, newest first; old ones are gone
assert.equal(mine.needCount, 3)                                                   // overdue (2) + today (1); heads-ups do not count
assert.deepEqual(mine.groups.map(g => g.bucket), BUCKET_ORDER.filter(b => ['overdue', 'today', 'later', 'nodate', 'info'].includes(b)))

const everyone = buildToday({ clients, inbox: [], me: ME, scope: 'everyone', today: TODAY })
assert.ok(everyone.groups.find(g => g.bucket === 'today')!.rows.some(r => r.kind === 'task' && r.task.id === 'sams'))

// the automatic item sorts ahead of a to-do on the same date, and dates run oldest first
const sorted = buildToday({ clients: [client('c1', 'Alpha', [task('x', { assigneeId: ME, dueDate: '2026-10-12', title: 'x' })])], inbox: [auto('urgent', '2026-10-12'), auto('urgent', '2026-10-09')], me: ME, scope: 'mine', today: TODAY })
assert.deepEqual(sorted.groups[0].rows.map(r => r.kind + ':' + (r.kind === 'task' ? r.task.id : r.kind === 'project' ? r.project.id : r.item.date)), ['auto:2026-10-09', 'auto:2026-10-12', 'task:x'])

// a client with no tasks field at all is fine
assert.equal(buildToday({ clients: [{ id: 'z', name: 'Z' } as unknown as Client], inbox: [], me: ME, scope: 'mine', today: TODAY }).groups.length, 0)

// ── projects on Today ──
const proj = (id: string, extra: Partial<Project> = {}): Project => ({ id, title: id, type: 'content', status: 'in-progress', createdAt: '2026-10-01', fromArtist: false, ...extra })
assert.equal(projectBucket(proj('a', { assigneeId: ME, dueDate: '2026-10-10' }), ME, 'mine', TODAY), 'overdue')   // given to me: mine
assert.equal(projectBucket(proj('a', { assigneeId: ME }), ME, 'mine', TODAY), 'nodate')
assert.equal(projectBucket(proj('a', { assigneeId: SAM, dueDate: TODAY }), ME, 'mine', TODAY), null)             // Sam's is not on my list...
assert.equal(projectBucket(proj('a', { assigneeId: SAM, dueDate: TODAY }), ME, 'everyone', TODAY), 'today')      // ...but is under Everyone
assert.equal(projectBucket(proj('a', { dueDate: '2026-12-01' }), ME, 'mine', TODAY), null)                       // nobody has it: only under Everyone
assert.equal(projectBucket(proj('a', { dueDate: '2026-12-01' }), ME, 'everyone', TODAY), 'later')
assert.equal(projectBucket(proj('a', { assigneeId: ME, status: 'done' }), ME, 'everyone', TODAY), null)          // finished: gone
// an artist's request that nobody has picked up shows for everyone, in both views, so it cannot be missed
const request = proj('req', { fromArtist: true, status: 'submitted' })
assert.equal(projectBucket(request, ME, 'mine', TODAY), 'today')
assert.equal(projectBucket(request, null, 'mine', TODAY), 'today')
assert.equal(projectBucket({ ...request, dueDate: '2026-10-01' }, ME, 'mine', TODAY), 'overdue')
assert.equal(projectBucket({ ...request, assigneeId: SAM }, ME, 'mine', TODAY), null)                            // once someone has it, it is theirs
assert.equal(projectBucket({ ...request, assigneeId: SAM }, ME, 'everyone', TODAY), 'nodate')
const withProjects = buildToday({ clients: [{ id: 'c1', name: 'Alpha', tasks: [], projects: [proj('mine-p', { assigneeId: ME, dueDate: TODAY }), proj('sams-p', { assigneeId: SAM }), request] } as unknown as Client], inbox: [], me: ME, scope: 'mine', today: TODAY })
assert.deepEqual(withProjects.groups.flatMap(g => g.rows).map(r => (r.kind === 'project' ? r.project.id : '?')).sort(), ['mine-p', 'req'])
assert.equal(withProjects.needCount, 2)

// a demo artist's sample projects stay off Today unless given to me
const demoOnly = (p: Project[]) => buildToday({ clients: [{ id: 'd', name: 'Demo', isDemo: true, tasks: [], projects: p } as unknown as Client], inbox: [], me: ME, scope: 'everyone', today: TODAY }).groups.length
assert.equal(demoOnly([request, proj('x', { dueDate: TODAY })]), 0)
assert.equal(demoOnly([proj('x', { assigneeId: ME, dueDate: TODAY })]), 1)

// ── what a to-do is about ──
const rich = { tour: { shows: [{ id: 's1', venue: 'Tresor', city: 'Berlin' }] }, agentData: { offers: [{ id: 'o1', venue: 'Fabric', city: 'London' }] }, finance: { invoices: [{ id: 'i1', number: 'INV-7', to: 'Sound LA' }], expenses: [{ id: 'e1', vendor: 'Hertz', description: 'Van' }, { id: 'e2', vendor: '', description: 'Strings' }] }, legal: { contracts: [{ id: 'c1', title: 'Label deal' }] }, projects: [{ id: 'p1', title: 'Press photos' }], songs: { albums: [{ tracks: [{ id: 't1', title: 'Golden Hour' }] }] } } as unknown as Client
assert.equal(describeLink(rich, { type: 'show', id: 's1' }), 'Tresor · Berlin')
assert.equal(describeLink(rich, { type: 'offer', id: 'o1' }), 'Fabric · London')
assert.equal(describeLink(rich, { type: 'invoice', id: 'i1' }), 'INV-7 · Sound LA')
assert.equal(describeLink(rich, { type: 'expense', id: 'e1' }), 'Hertz')
assert.equal(describeLink(rich, { type: 'expense', id: 'e2' }), 'Strings')
assert.equal(describeLink(rich, { type: 'contract', id: 'c1' }), 'Label deal')
assert.equal(describeLink(rich, { type: 'project', id: 'p1' }), 'Press photos')
assert.equal(describeLink(rich, { type: 'song', id: 't1' }), 'Golden Hour')
assert.equal(describeLink(rich, { type: 'show', id: 'gone' }), undefined)           // the thing was removed: say nothing

// ── who a to-do can be given to ──
const person = (userId: string, label: string, extra: Partial<WorkspacePerson> = {}): WorkspacePerson =>
  ({ memberId: 'm-' + userId, userId, label, role: 'team', allClients: false, clientIds: [], ...extra })
const people = [person('u-zed', 'Zed', { allClients: true }), person(ME, 'Me', { allClients: true }), person('u-ann', 'Ann', { clientIds: ['c1'] }), person('u-bob', 'Bob', { clientIds: ['c2'] })]
assert.deepEqual(peopleFor(people, 'c1', ME).map(p => p.label), ['Me', 'Ann', 'Zed'])    // me first, then A-Z, only those who can open c1
assert.deepEqual(peopleFor(people, 'c2', ME).map(p => p.label), ['Me', 'Bob', 'Zed'])
assert.deepEqual(peopleFor(people, 'c9', ME).map(p => p.label), ['Me', 'Zed'])

// ── how a due date reads ──
assert.equal(dueLabel('2026-10-14', TODAY), 'Today')
assert.equal(dueLabel('2026-10-15', TODAY), 'Tomorrow')
assert.equal(dueLabel('2026-10-16', TODAY), 'Fri')            // within the coming week: the weekday
assert.equal(dueLabel('2026-10-20', TODAY), 'Tue')
assert.equal(dueLabel('2026-10-21', TODAY), 'Oct 21')         // a full week out: the date
assert.equal(dueLabel('2026-10-10', TODAY), 'Oct 10')         // past: the date
assert.equal(dueLabel('2027-01-05', TODAY), 'Jan 5, 2027')

// ── where Open goes ──
assert.deepEqual(taskDestination({ type: 'show', id: 's1' }), { section: 'tour', sub: 'tour', showId: 's1' })
assert.deepEqual(taskDestination({ type: 'invoice', id: 'i1' }), { section: 'finance', sub: 'invoices', showId: undefined })
assert.equal(taskDestination({ type: 'song', id: 'x' }).section, 'songs')
assert.equal(taskSection(undefined), 'projects')              // a to-do that points at nothing belongs to Projects
assert.equal(taskSection({ type: 'invoice', id: 'i' }), 'finance')

// ── quick add ──
const q = (s: string) => parseQuickTodo(s, TODAY)
assert.deepEqual(q('Call the promoter today'), { title: 'Call the promoter', dueDate: '2026-10-14' })
assert.deepEqual(q('Call the promoter tomorrow'), { title: 'Call the promoter', dueDate: '2026-10-15' })
assert.deepEqual(q('Send W9 by friday'), { title: 'Send W9', dueDate: '2026-10-16' })
assert.deepEqual(q('Send W9 on Fri'), { title: 'Send W9', dueDate: '2026-10-16' })
assert.deepEqual(q('Review deck wednesday'), { title: 'Review deck', dueDate: '2026-10-21' })        // the same weekday means next week, never today
assert.deepEqual(q('Review deck next monday'), { title: 'Review deck', dueDate: '2026-10-19' })
assert.deepEqual(q('Plan the rollout next week'), { title: 'Plan the rollout', dueDate: '2026-10-19' })
assert.deepEqual(q('Chase the label in 3 days'), { title: 'Chase the label', dueDate: '2026-10-17' })
assert.deepEqual(q('Chase the label in 2 weeks'), { title: 'Chase the label', dueDate: '2026-10-28' })
assert.deepEqual(q('Settle the Amsterdam show 10/21'), { title: 'Settle the Amsterdam show', dueDate: '2026-10-21' })
assert.deepEqual(q('Settle the Amsterdam show by Oct 21'), { title: 'Settle the Amsterdam show', dueDate: '2026-10-21' })
assert.deepEqual(q('Renew the contract Jan 5th'), { title: 'Renew the contract', dueDate: '2027-01-05' })  // already past this year: next year
assert.deepEqual(q('Pay the vendor, friday'), { title: 'Pay the vendor', dueDate: '2026-10-16' })
// no date, a date that is not a real one, or a date-word that is the whole text: left alone
assert.deepEqual(q('Call the promoter'), { title: 'Call the promoter' })
assert.deepEqual(q('friday'), { title: 'friday' })
assert.deepEqual(q('Do the thing 2/31'), { title: 'Do the thing 2/31' })
assert.deepEqual(q('Do the thing in 0 days'), { title: 'Do the thing in 0 days' })
assert.deepEqual(q('Call on friday about the friday show'), { title: 'Call on friday about the friday show' })   // only a date at the very end counts
assert.deepEqual(q('  spaced   out   tomorrow '), { title: 'spaced out', dueDate: '2026-10-15' })

// ── ⌘K words ──
assert.equal(todoPrefix('to-do: call the promoter friday'), 'call the promoter friday')
assert.equal(todoPrefix('todo call the promoter'), 'call the promoter')
assert.equal(todoPrefix('Task - send W9'), 'send W9')
assert.equal(todoPrefix('remind me to pay Sam'), 'pay Sam')
assert.equal(todoPrefix('todos for tomorrow'), null)       // "todos" is not the word
assert.equal(todoPrefix('to-do'), null)                    // nothing after it yet
assert.equal(todoPrefix('nimino'), null)

console.log('tasks: all checks passed')
