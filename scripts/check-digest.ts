// Checks the morning email: who gets it, what goes in it, and above all that nobody is emailed about something they may not see.
// Run with:  npx tsx scripts/check-digest.ts
import assert from 'node:assert/strict'
import { digestFor, renderDigest, clientsOf, viewerOf, MAX_LINES, type DigestRecipient, type DigestContext } from '../src/lib/digest'
import { parsePath } from '../src/lib/routes'
import { buildInbox } from '../src/lib/inbox'
import type { Client, Contract, Invoice, Task } from '../src/types'
import { filterClientForViewer, type ItemException } from '../src/lib/item-access'
import type { Show, TourOffer } from '../src/types'

const TODAY = '2026-10-26'
const NOW = Date.parse('2026-10-26T13:00:00Z')

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }

const invoice = (id: string, o: Partial<Invoice> = {}): Invoice => ({ id, number: id.toUpperCase(), to: 'Promoter', category: 'touring', status: 'sent', issuedDate: '2026-09-01', dueDate: '2026-10-01', items: [{ description: 'x', quantity: 1, rate: 3000 }], currency: 'USD', ...o } as Invoice)
const contract = (id: string, o: Partial<Contract> = {}): Contract => ({ id, title: 'Publishing deal', type: 'publishing', status: 'signed', counterparty: 'Kobalt', currency: 'USD', autoRenews: true, noticeDays: 60, expiryDate: '2027-01-05', ...o } as Contract)
const task = (id: string, o: Partial<Task> = {}): Task => ({ id, title: 'Call the venue', source: 'manual', createdAt: '2026-10-26T09:00:00Z', ...o } as Task)

interface Parts { deposits?: unknown[]; id?: string; name?: string; invoices?: Invoice[]; contracts?: Contract[]; tasks?: Task[]; isDemo?: boolean }
function client(p: Parts = {}): Client {
  return {
    id: p.id ?? 'a1', name: p.name ?? 'Artist One', isDemo: p.isDemo,
    tour: { shows: [], advances: [], guestList: [], offerSheets: [], travel: [] },
    songs: { albums: [] }, content: { posts: [] }, projects: [],
    legal: { contracts: p.contracts ?? [] },
    finance: { invoices: p.invoices ?? [], expenses: [], vendors: [], budgets: [], crewRates: [], settlements: [] },
    agentData: { offers: [] },
    business: { banking: { deposits: p.deposits ?? [] } },
    tasks: p.tasks ?? [],
  } as unknown as Client
}

const person = (o: Partial<DigestRecipient> = {}): DigestRecipient => ({ memberId: 'm1', userId: 'u1', role: 'team', clientId: null, grants: [], ...o })
const ctx = (o: Partial<DigestContext> = {}): DigestContext => ({ exceptions: [], choices: {}, today: TODAY, now: NOW, announced: new Set<string>(), ...o })
const grant = (section: string, clientId: string | null = null) => ({ section, clientId, canEdit: false })
const titles = (r: ReturnType<typeof digestFor>) => (r?.items ?? []).map(i => `${i.clientId}:${i.rule}`).sort()

// Two artists, each with money owed and a contract to act on.
const A = client({ id: 'a1', name: 'Artist One', invoices: [invoice('inv-a')], contracts: [contract('k-a')] })
const B = client({ id: 'b1', name: 'Artist Two', invoices: [invoice('inv-b')], contracts: [contract('k-b')] })
const BOTH = [A, B]

check('a manager gets everything for every artist', () => {
  const d = digestFor(person({ role: 'manager' }), BOTH, ctx())!
  assert.deepEqual(titles(d), ['a1:contract', 'a1:invoice', 'b1:contract', 'b1:invoice'])
})

check('someone with only Tour access gets nothing about money or contracts', () => {
  assert.equal(digestFor(person({ grants: [grant('tour', 'a1')] }), BOTH, ctx()), null)
})

check('Finance on one artist gives that artist\'s money alerts and nothing else', () => {
  const d = digestFor(person({ grants: [grant('finance', 'a1')] }), BOTH, ctx())!
  assert.deepEqual(titles(d), ['a1:invoice'])
})

check('Legal on one artist gives that artist\'s contract alerts only', () => {
  const d = digestFor(person({ grants: [grant('legal', 'b1')] }), BOTH, ctx())!
  assert.deepEqual(titles(d), ['b1:contract'])
})

check('a company-wide grant (no artist named) covers every artist, but only that section', () => {
  const d = digestFor(person({ grants: [grant('finance', null)] }), BOTH, ctx())!
  assert.deepEqual(titles(d), ['a1:invoice', 'b1:invoice'])
})

check('a Point Person for one artist gets all of that artist, none of the others', () => {
  const d = digestFor(person({ grants: [grant('admin', 'a1')] }), BOTH, ctx())!
  assert.deepEqual(titles(d), ['a1:contract', 'a1:invoice'])
})

check('a grant for another artist gives nothing here', () => {
  assert.equal(digestFor(person({ grants: [grant('finance', 'zzz')] }), BOTH, ctx()), null)
})

check('someone with no grants gets nothing', () => assert.equal(digestFor(person(), BOTH, ctx()), null))

check('an invoice hidden from this person is left out, even though they hold Finance', () => {
  const hide: ItemException = { id: 'x1', clientId: 'a1', itemType: 'invoice', itemId: 'inv-a', memberId: 'm1', effect: 'hide' }
  assert.equal(digestFor(person({ grants: [grant('finance', 'a1')] }), BOTH, ctx({ exceptions: [hide] })), null)
  // ...and hiding it from someone else changes nothing for this person
  const other: ItemException = { ...hide, memberId: 'someone-else' }
  assert.deepEqual(titles(digestFor(person({ grants: [grant('finance', 'a1')] }), BOTH, ctx({ exceptions: [other] }))), ['a1:invoice'])
})

check('one invoice shared with someone who has no Finance grant does not open the money alerts', () => {
  const share: ItemException = { id: 'x2', clientId: 'a1', itemType: 'invoice', itemId: 'inv-a', memberId: 'm1', effect: 'share' }
  assert.equal(digestFor(person({ grants: [grant('tour', 'a1')] }), BOTH, ctx({ exceptions: [share] })), null)
})

check('the artist\'s own login never gets the email, whatever it holds', () => {
  assert.equal(digestFor(person({ role: 'artist', clientId: 'a1', grants: [grant('finance', 'a1'), grant('legal', 'a1')] }), BOTH, ctx()), null)
  assert.deepEqual(clientsOf(person({ role: 'artist', clientId: 'a1' }), BOTH), [])
})

check('practice (demo) artists are left out, even for the manager', () => {
  const demo = client({ id: 'demo', name: 'Nova Lane (Demo)', isDemo: true, invoices: [invoice('inv-d')] })
  assert.equal(digestFor(person({ role: 'manager' }), [demo], ctx()), null)
  assert.deepEqual(titles(digestFor(person({ role: 'manager' }), [demo, A], ctx())), ['a1:contract', 'a1:invoice'])
})

check('what the person marked Done or snoozed is not repeated; a snooze that has ended comes back', () => {
  const mgr = person({ role: 'manager' })
  const keys = digestFor(mgr, [A], ctx())!.items.map(i => i.key)
  const done = Object.fromEntries(keys.map(k => [k, { state: 'done' as const }]))
  assert.equal(digestFor(mgr, [A], ctx({ choices: done })), null)
  const snoozed = Object.fromEntries(keys.map(k => [k, { state: 'snoozed' as const, until: '2026-10-30' }]))
  assert.equal(digestFor(mgr, [A], ctx({ choices: snoozed })), null)
  const ended = Object.fromEntries(keys.map(k => [k, { state: 'snoozed' as const, until: '2026-10-25' }]))
  assert.equal(digestFor(mgr, [A], ctx({ choices: ended }))!.items.length, keys.length)
})

check('heads-ups do not make an email; nothing at all makes no email', () => {
  const headsUp = client({ deposits: [{ done: false }] })
  assert.equal(buildInbox(headsUp, TODAY, { finance: true, tour: true, deals: true, legal: true, projects: true, music: true }).filter(i => i.severity === 'info').length, 1, 'the fixture does raise a heads-up')
  assert.equal(digestFor(person({ role: 'manager' }), [headsUp], ctx()), null)
  assert.equal(digestFor(person({ role: 'manager' }), [client()], ctx()), null)
  assert.equal(digestFor(person({ role: 'manager' }), [], ctx()), null)
})

// ── what a show pays needs Deals & fees, not just Tour or Finance (the database keeps it in tables only that grant opens) ──
check('someone with Tour and Finance but not Deals & fees sees the show, never what it pays, and no booking offers', () => {
  const show: Show = { id: 's1', date: '2026-10-20', city: 'Berlin', venue: 'Tresor', time: '22:00', status: 'confirmed', guarantee: 5000, deposit: 2500, received: 1000, currency: 'USD', viaAgency: true, agencyName: 'Agency', agencyCommissionPct: 10, managementCommissionPct: 15, invoiceId: 'inv-x' }
  const offer = { id: 'o1', venue: 'Tresor', status: 'confirmed', guarantee: 5000 } as unknown as TourOffer
  const c = { ...A, tour: { ...A.tour, shows: [show] }, agentData: { offers: [offer] } } as unknown as Client
  const noDeals = filterClientForViewer(c, viewerOf(person({ grants: [grant('tour', 'a1'), grant('finance', 'a1')] })), [])
  assert.equal(noDeals.tour.shows.length, 1); assert.equal(noDeals.tour.shows[0].venue, 'Tresor')
  for (const k of ['guarantee', 'deposit', 'received', 'currency', 'viaAgency', 'agencyName', 'agencyCommissionPct', 'managementCommissionPct', 'invoiceId'] as const) assert.equal(noDeals.tour.shows[0][k], undefined, k)
  assert.deepEqual(noDeals.agentData.offers, [])
  const withDeals = filterClientForViewer(c, viewerOf(person({ grants: [grant('tour', 'a1'), grant('deals', 'a1'), grant('finance', 'a1')] })), [])
  assert.equal(withDeals.tour.shows[0].guarantee, 5000); assert.equal(withDeals.agentData.offers.length, 1)
  assert.equal(filterClientForViewer(c, viewerOf(person({ role: 'manager' })), []).tour.shows[0].guarantee, 5000, 'a manager sees it all')
  assert.equal(filterClientForViewer(c, viewerOf(person({ role: 'artist', clientId: 'a1' })), []).tour.shows[0].guarantee, undefined, 'the artist\'s own login never gets the show money')
  assert.equal(filterClientForViewer(c, viewerOf(person({ grants: [grant('admin', 'a1')] })), []).tour.shows[0].guarantee, 5000, 'a Point Person sees it')
})

// ── to-dos given to the person ──
const mine = person({ role: 'manager', userId: 'u1' })
check('a to-do someone just gave me is in the email', () => {
  const c = client({ tasks: [task('t1', { assigneeId: 'u1', createdBy: 'u2', createdAt: '2026-10-26T08:00:00Z' })] })
  const d = digestFor(mine, [c], ctx())!
  assert.equal(d.tasks.length, 1); assert.equal(d.tasks[0].why, 'new')
})
check('a to-do is announced once: after it has been told, it is not "given to you" again', () => {
  const c = client({ tasks: [task('t1', { assigneeId: 'u1', createdBy: 'u2', createdAt: '2026-10-26T08:00:00Z' })] })
  const first = digestFor(mine, [c], ctx())!
  const mail = renderDigest(first, { appUrl: 'https://x.test' })
  assert.deepEqual(mail.announcedTaskIds, ['t1'])
  assert.equal(digestFor(mine, [c], ctx({ announced: new Set(mail.announcedTaskIds), now: NOW + 24 * 3_600_000 })), null, 'the next morning has nothing to say about it')
  // ...but a to-do that is also due still shows up as due
  const due = client({ tasks: [task('t2', { assigneeId: 'u1', createdBy: 'u2', createdAt: '2026-10-26T08:00:00Z', dueDate: '2026-10-27' })] })
  const again = digestFor(mine, [due], ctx({ announced: new Set(['t2']) }))!
  assert.equal(again.tasks[0].why, 'due'); assert.deepEqual(renderDigest(again, { appUrl: 'https://x.test' }).announcedTaskIds, [])
})
check('a to-do given to me three days ago and never announced is no longer "new" (it is just a to-do)', () => {
  const c = client({ tasks: [task('t1', { assigneeId: 'u1', createdBy: 'u2', createdAt: '2026-10-22T08:00:00Z' })] })
  assert.equal(digestFor(mine, [c], ctx()), null)
})
check('a to-do I gave myself, or an old one with no date, is not', () => {
  const c = client({ tasks: [task('t1', { assigneeId: 'u1', createdBy: 'u1' }), task('t2', { assigneeId: 'u1', createdBy: 'u2', createdAt: '2026-10-20T08:00:00Z' })] })
  assert.equal(digestFor(mine, [c], ctx()), null)
})
check('a to-do due by tomorrow (or late) is in; one due next week is not', () => {
  const c = client({ tasks: [
    task('late', { assigneeId: 'u1', createdAt: '2026-10-01T00:00:00Z', dueDate: '2026-10-20' }),
    task('tomorrow', { assigneeId: 'u1', createdAt: '2026-10-01T00:00:00Z', dueDate: '2026-10-27' }),
    task('later', { assigneeId: 'u1', createdAt: '2026-10-01T00:00:00Z', dueDate: '2026-11-03' }),
  ] })
  assert.deepEqual(digestFor(mine, [c], ctx())!.tasks.map(t => t.task.id), ['late', 'tomorrow'])
})
check('a finished to-do, or one given to someone else, is not', () => {
  const c = client({ tasks: [
    task('done', { assigneeId: 'u1', createdBy: 'u2', doneAt: '2026-10-26T10:00:00Z' }),
    task('theirs', { assigneeId: 'u9', createdBy: 'u2', dueDate: '2026-10-26' }),
  ] })
  assert.equal(digestFor(mine, [c], ctx()), null)
})
check('a to-do for an artist the person cannot open is not in their email', () => {
  const secret = client({ id: 'b1', name: 'Hidden', tasks: [task('t', { assigneeId: 'u1', createdBy: 'u2', dueDate: '2026-10-26' })] })
  assert.equal(digestFor(person({ grants: [grant('tour', 'a1')], userId: 'u1' }), [A, secret], ctx()), null)
})

// ── the words ──
check('the email says what it is about, once per artist, with a link that opens in the app', () => {
  const d = digestFor(person({ role: 'manager' }), BOTH, ctx())!
  const mail = renderDigest(d, { appUrl: 'https://www.mgmtpath.com' })
  assert.equal(mail.subject, 'Mgmt Path: 4 things for you today')
  assert.match(mail.text, /Artist One/); assert.match(mail.text, /Artist Two/)
  assert.match(mail.text, /switch off "Morning email"/)
  for (const path of ['/artists/a1/today', '/artists/b1/today']) {
    assert.ok(mail.text.includes('https://www.mgmtpath.com' + path), path)
    assert.equal(parsePath(path)?.view, 'studio', `${path} is a real address in the app`)
  }
  assert.equal(parsePath('/today')?.view, 'dashboard')
})
check('one thing reads as one thing', () => {
  const d = digestFor(person({ grants: [grant('legal', 'a1')] }), [A], ctx())!
  assert.equal(renderDigest(d, { appUrl: 'https://x.test' }).subject, 'Mgmt Path: 1 thing for you today')
})
check('what the artist\'s own data says cannot break the page (everything is escaped)', () => {
  const nasty = client({ name: 'A <img src=x onerror=alert(1)> & Co', invoices: [invoice('inv-n', { to: '<script>alert(1)</script>' })] })
  const mail = renderDigest(digestFor(person({ role: 'manager' }), [nasty], ctx())!, { appUrl: 'https://x.test' })
  assert.ok(!mail.html.includes('<script>')); assert.ok(!mail.html.includes('<img'))
  assert.ok(mail.html.includes('&lt;img')); assert.ok(mail.html.includes('&amp; Co'))
})
check('a very long list is cut and the rest is counted, not listed', () => {
  const many = client({ invoices: Array.from({ length: MAX_LINES + 5 }, (_, i) => invoice(`inv-${i}`)) })
  const d = digestFor(person({ role: 'manager' }), [many], ctx())!
  assert.equal(d.items.length, MAX_LINES + 5)
  const mail = renderDigest(d, { appUrl: 'https://x.test' })
  assert.equal(mail.text.split('\n').filter(l => l.startsWith('  • ')).length, MAX_LINES)
  assert.match(mail.text, /and 5 more things in the app/)
  assert.equal(mail.subject, `Mgmt Path: ${MAX_LINES + 5} things for you today`)
})
check('the worst thing comes first', () => {
  const c = client({ invoices: [invoice('soon', { dueDate: '2026-10-28' }), invoice('late')] })
  const d = digestFor(person({ role: 'manager' }), [c], ctx())!
  assert.deepEqual(d.items.map(i => i.severity), ['urgent', 'soon'])
})

console.log(`${n} checks passed`)
