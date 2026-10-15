// Checks the to-do logic (grouping, whose list, quick-add words).  Run with:  npx tsx scripts/check-tasks.ts
import assert from 'node:assert/strict'
import { BUCKET_ORDER, aboutOptions, autoBucket, bucketOf, buildToday, describeLink, dueLabel, isMine, parseAbout, parseQuickTodo, peopleFor, projectBucket, taskDestination, taskSection, todoPrefix } from '../src/lib/tasks'
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
const idsIn = (b: string) => mine.groups.find(g => g.bucket === b)?.rows.map(r => (r.kind === 'task' ? r.task.id : r.kind === 'project' ? r.project.id : r.kind === 'keydate' ? r.keyDate.key : r.item.title)) ?? []
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
assert.deepEqual(sorted.groups[0].rows.map(r => r.kind + ':' + (r.kind === 'task' ? r.task.id : r.kind === 'project' ? r.project.id : r.kind === 'keydate' ? r.keyDate.key : r.item.date)), ['auto:2026-10-09', 'auto:2026-10-12', 'task:x'])

// "finished recently" counts days where the viewer is, not in UTC
const lateNight = buildToday({ clients: [client('c1', 'Alpha', [task('late', { assigneeId: ME, doneAt: new Date(2026, 9, 1, 23, 30).toISOString() })])], inbox: [], me: ME, scope: 'mine', today: TODAY })
assert.equal(lateNight.done.length, 1)                                           // done at 11:30pm local on Oct 1: inside the 14-day window that starts Sep 30
assert.equal(buildToday({ clients: [client('c1', 'Alpha', [task('early', { assigneeId: ME, doneAt: new Date(2026, 8, 29, 23, 30).toISOString() })])], inbox: [], me: ME, scope: 'mine', today: TODAY }).done.length, 0)   // Sep 29 local: outside

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
assert.equal(projectBucket({ ...request, status: 'in-progress' }, ME, 'mine', TODAY), 'today')                    // moved along but still nobody's: it must not vanish
assert.equal(projectBucket({ ...request, status: 'done' }, ME, 'mine', TODAY), null)
assert.equal(projectBucket({ ...request, assigneeId: SAM }, ME, 'everyone', TODAY), 'nodate')
const withProjects = buildToday({ clients: [{ id: 'c1', name: 'Alpha', tasks: [], projects: [proj('mine-p', { assigneeId: ME, dueDate: TODAY }), proj('sams-p', { assigneeId: SAM }), request] } as unknown as Client], inbox: [], me: ME, scope: 'mine', today: TODAY })
assert.deepEqual(withProjects.groups.flatMap(g => g.rows).map(r => (r.kind === 'project' ? r.project.id : '?')).sort(), ['mine-p', 'req'])
assert.equal(withProjects.needCount, 2)

// a demo artist's sample projects stay off Today unless given to me
const demoOnly = (p: Project[]) => buildToday({ clients: [{ id: 'd', name: 'Demo', isDemo: true, tasks: [], projects: p } as unknown as Client], inbox: [], me: ME, scope: 'everyone', today: TODAY }).groups.length
assert.equal(demoOnly([request, proj('x', { dueDate: TODAY })]), 0)
assert.equal(demoOnly([proj('x', { assigneeId: ME, dueDate: TODAY })]), 1)

// key dates show in both views (up for grabs) and need Tour access
const kdClient = { id: 'k1', name: 'Kay', tasks: [], projects: [], tour: { shows: [{ id: 's9', venue: 'Fabric', city: 'London', date: '2026-11-04', status: 'confirmed' }], advances: [], travel: [], guestList: [] }, finance: { budgets: [], invoices: [], settlements: [], expenses: [] } } as unknown as Client
const kd = (scope: 'mine' | 'everyone', canTour?: (id: string) => boolean) => buildToday({ clients: [kdClient], inbox: [], me: ME, scope, today: TODAY, canTour })
assert.deepEqual(kd('mine').groups.flatMap(g => g.rows).map(r => r.kind === 'keydate' ? r.keyDate.key : '?'), ['advance:s9'])
assert.equal(kd('everyone').groups.flatMap(g => g.rows).length, 1)
assert.equal(kd('mine', () => false).groups.length, 0)                               // no Tour access: no key dates
assert.equal(kd('mine').groups[0].bucket, 'week')                                    // due Oct 21: this week
assert.equal(kd('mine').needCount, 0)

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

// ── the "About" menu: a to-do can be about anything ──
const artist = {
  tour: { shows: [
    { id: 's-late', venue: 'Tresor', city: 'Berlin', date: '2026-11-10', status: 'confirmed' },
    { id: 's-soon', venue: 'Fabric', city: 'London', date: '2026-10-20', status: 'confirmed' },
    { id: 's-past', venue: 'Old', city: 'Town', date: '2026-09-01', status: 'confirmed' },
    { id: 's-off', venue: 'Cancelled', city: 'X', date: '2026-10-25', status: 'cancelled' },
    { id: 's-hist', venue: 'History', city: 'Y', date: '2026-10-26', status: 'confirmed', historyOnly: true },
  ] },
  agentData: { offers: [
    { id: 'o-open', venue: 'Razzmatazz', city: 'Barcelona', date: '2026-12-01', status: 'inquiry' },
    { id: 'o-hold', venue: 'Sound', city: 'LA', date: '2026-11-15', status: 'hold' },
    { id: 'o-done', venue: 'Berghain', city: 'Berlin', date: '2026-10-30', status: 'confirmed' },
  ] },
  songs: { albums: [{ tracks: [{ id: 't1', title: 'Golden Hour' }, { id: 't2', title: '' }] }, { tracks: [{ id: 't3', title: 'Long Time' }] }] },
  finance: {
    invoices: [
      { id: 'i-late', number: 'INV-2', to: 'Sound LA', status: 'sent', dueDate: '2026-11-01' },
      { id: 'i-early', number: 'INV-1', to: 'Fabric', status: 'overdue', dueDate: '2026-10-01' },
      { id: 'i-paid', number: 'INV-0', to: 'Old', status: 'paid', dueDate: '2026-09-01' },
      { id: 'i-void', number: 'INV-X', to: 'Nobody', status: 'void', dueDate: '2026-09-02' },
    ],
    expenses: [{ id: 'e-open', vendor: 'Hertz', description: 'Van', paid: false, date: '2026-10-10' }, { id: 'e-paid', vendor: 'Done', description: '', paid: true, date: '2026-10-01' }],
  },
  legal: { contracts: [{ id: 'c-live', title: 'Label deal', status: 'signed' }, { id: 'c-old', title: 'Old deal', status: 'expired' }, { id: 'c-end', title: 'Ended', status: 'terminated' }] },
  projects: [{ id: 'p-open', title: 'Press photos', status: 'in-progress' }, { id: 'p-done', title: 'Done thing', status: 'done' }],
} as unknown as Client
const everything = () => true
const groupsOf = (canEdit: (s: Parameters<typeof aboutOptions>[1] extends (s: infer S) => boolean ? S : never) => boolean) => aboutOptions(artist, canEdit, TODAY)
const all = groupsOf(everything)
assert.deepEqual(all.map(g => g.label), ['Shows', 'Offers', 'Songs', 'Invoices', 'Bills', 'Contracts', 'Projects'])
const labelsOf = (group: string) => all.find(g => g.label === group)!.options.map(o => o.label)
// shows: upcoming only (no cancelled, history-only or past ones), soonest first
assert.deepEqual(labelsOf('Shows'), ['Fabric · London · 10-20', 'Tresor · Berlin · 11-10'])
// offers: only the ones still being worked on, soonest first
assert.deepEqual(labelsOf('Offers'), ['Sound · LA · 11-15', 'Razzmatazz · Barcelona · 12-01'])
// songs across every release, untitled ones named
assert.deepEqual(labelsOf('Songs'), ['Golden Hour', 'Untitled', 'Long Time'])
// invoices not yet paid, earliest due first; bills not yet paid; contracts that are still alive; projects not done
assert.deepEqual(labelsOf('Invoices'), ['INV-1 · Fabric', 'INV-2 · Sound LA'])
assert.deepEqual(labelsOf('Bills'), ['Hertz'])
assert.deepEqual(labelsOf('Contracts'), ['Label deal'])
assert.deepEqual(labelsOf('Projects'), ['Press photos'])
// every value turns back into the right link
for (const g of all) for (const o of g.options) assert.ok(parseAbout(o.value), `${o.value} should parse`)
assert.deepEqual(parseAbout('invoice:i-early'), { type: 'invoice', id: 'i-early' })
assert.deepEqual(parseAbout('song:t1'), { type: 'song', id: 't1' })
assert.deepEqual(parseAbout('expense:e-open'), { type: 'expense', id: 'e-open' })
assert.equal(parseAbout(''), undefined); assert.equal(parseAbout('vault:x'), undefined); assert.equal(parseAbout('show:'), undefined); assert.equal(parseAbout('nonsense'), undefined)
// only what the person may edit: Tour covers shows and offers, Finance covers invoices and bills, and so on
assert.deepEqual(groupsOf(s => s === 'finance').map(g => g.label), ['Invoices', 'Bills'])
assert.deepEqual(groupsOf(s => s === 'tour').map(g => g.label), ['Shows', 'Offers'])
assert.deepEqual(groupsOf(s => s === 'songs').map(g => g.label), ['Songs'])
assert.deepEqual(groupsOf(s => s === 'legal').map(g => g.label), ['Contracts'])
assert.deepEqual(groupsOf(s => s === 'projects').map(g => g.label), ['Projects'])
assert.deepEqual(groupsOf(() => false), [])
// the menu agrees with where each kind is saved, so the database accepts what the menu offers
for (const t of ['show', 'offer', 'invoice', 'expense', 'contract', 'song', 'project'] as const) {
  const section = taskSection({ type: t, id: 'x' })
  assert.ok(groupsOf(s => s === section).some(g => g.options.some(o => o.value.startsWith(t + ':'))), `${t} should be offered to someone who can edit ${section}`)
}
// lists stay short
const many = { ...artist, projects: Array.from({ length: 40 }, (_, i) => ({ id: 'p' + i, title: 'P' + i, status: 'in-progress' })) } as unknown as Client
assert.equal(aboutOptions(many, everything, TODAY).find(g => g.label === 'Projects')!.options.length, 15)

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
assert.equal(todoPrefix('task: send W9'), 'send W9')
assert.equal(todoPrefix('task force'), null)               // searching for "task force" is not a to-do
assert.equal(todoPrefix('task'), null)
assert.equal(todoPrefix('todo:call the label'), 'call the label')
assert.equal(todoPrefix('remind me to pay Sam'), 'pay Sam')
assert.equal(todoPrefix('todos for tomorrow'), null)       // "todos" is not the word
assert.equal(todoPrefix('to-do'), null)                    // nothing after it yet
assert.equal(todoPrefix('nimino'), null)

console.log('tasks: all checks passed')
