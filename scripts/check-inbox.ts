// Checks every rule that puts something on Home ("needs you"), and who may see it.  Run with:  npx tsx scripts/check-inbox.ts
import assert from 'node:assert/strict'
import { buildInbox, isHidden, type InboxAccess, type InboxItem, type InboxRule } from '../src/lib/inbox'
import type { Client, Contract, Expense, Invoice, OfferSheet, Project, Settlement, Show, TourOffer } from '../src/types'

const TODAY = '2026-10-19'
const ALL: InboxAccess = { finance: true, tour: true, deals: true, legal: true, projects: true }
const NONE: InboxAccess = { finance: false, tour: false, deals: false, legal: false, projects: false }

interface Parts { shows?: Show[]; invoices?: Invoice[]; expenses?: Expense[]; settlements?: Settlement[]; offers?: TourOffer[]; contracts?: Contract[]; projects?: Project[]; sheets?: OfferSheet[]; deposits?: unknown[]; budgets?: unknown[]; isDemo?: boolean }
function client(p: Parts = {}): Client {
  return {
    id: 'c1', name: 'Artist', isDemo: p.isDemo,
    tour: { shows: p.shows ?? [], offerSheets: p.sheets ?? [] },
    finance: { invoices: p.invoices ?? [], expenses: p.expenses ?? [], settlements: p.settlements ?? [], budgets: p.budgets ?? [] },
    agentData: { offers: p.offers ?? [] },
    business: { banking: { deposits: p.deposits ?? [] } },
    legal: { contracts: p.contracts ?? [] },
    projects: p.projects ?? [],
  } as unknown as Client
}
const run = (p: Parts, rule: InboxRule, access: InboxAccess = ALL): InboxItem[] => buildInbox(client(p), TODAY, access).filter(i => i.rule === rule)
const one = (p: Parts, rule: InboxRule, access: InboxAccess = ALL): InboxItem => { const r = run(p, rule, access); assert.equal(r.length, 1, `expected one ${rule} item, got ${r.length}`); return r[0] }
const sev = (p: Parts, rule: InboxRule) => run(p, rule).map(i => i.severity)

const invoice = (o: Partial<Invoice> = {}): Invoice => ({ id: 'i1', number: 'INV-1', to: 'Promoter', category: 'touring', status: 'sent', issuedDate: '2026-09-01', dueDate: '2026-10-01', items: [{ description: 'x', quantity: 1, rate: 3000 }], currency: 'USD', ...o } as Invoice)
const bill = (o: Partial<Expense> = {}): Expense => ({ id: 'e1', description: 'Van', vendor: 'Vans Inc', amount: 800, currency: 'USD', category: 'travel', date: '2026-10-01', paid: false, dueDate: '2026-10-10', ...o } as Expense)
const show = (o: Partial<Show> = {}): Show => ({ id: 's1', date: '2026-10-15', city: 'Lisbon', venue: 'LX', time: '20:00', status: 'confirmed', ...o })
const offer = (o: Partial<TourOffer> = {}): TourOffer => ({ id: 'o1', venue: 'Tresor', city: 'Berlin', country: 'DE', date: '2026-12-01', promoter: 'P', guarantee: 5000, status: 'inquiry', ...o } as TourOffer)
const settlement = (o: Partial<Settlement> = {}): Settlement => ({ id: 'st1', showIds: ['sX'], currency: 'USD', totalDue: 12000, payments: [{ label: 'Deposit', amount: 5000 }], confirmedAt: '2026-10-10T12:00:00Z', preparedOn: '2026-10-10', venue: 'LX', promoter: 'Live Co', boxOffice: [], expenses: [], payout: [], ...o } as unknown as Settlement)
const contract = (o: Partial<Contract> = {}): Contract => ({ id: 'k1', title: 'Pub deal', type: 'publishing', status: 'signed', counterparty: 'Kobalt', currency: 'USD', ...o } as Contract)
const project = (o: Partial<Project> = {}): Project => ({ id: 'p1', title: 'Artwork', type: 'design', status: 'in-progress', dueDate: '2026-10-16', ...o } as Project)
const sheet = (o: Partial<OfferSheet> = {}): OfferSheet => ({ id: 'sh1', offerId: 'o1', version: 1, status: 'sent', detail: 'summary', snapshot: {}, sentAt: '2026-10-10T12:00:00Z', ...o } as unknown as OfferSheet)

// ── invoice: sent and past due ──
let it = one({ invoices: [invoice()] }, 'invoice')
assert.equal(it.severity, 'urgent'); assert.match(it.title, /18 days overdue/); assert.equal(it.amount, 3000)
assert.deepEqual(sev({ invoices: [invoice({ dueDate: '2026-10-22' })] }, 'invoice'), ['soon'])       // due in 3 days
assert.deepEqual(sev({ invoices: [invoice({ dueDate: '2026-10-19' })] }, 'invoice'), ['soon'])       // due today
assert.equal(run({ invoices: [invoice({ dueDate: '2026-11-30' })] }, 'invoice').length, 0)           // not for a while
for (const status of ['paid', 'draft', 'void'] as const) assert.equal(run({ invoices: [invoice({ status })] }, 'invoice').length, 0, `an invoice that is ${status} raises nothing`)
assert.deepEqual(sev({ invoices: [invoice({ status: 'overdue' })] }, 'invoice'), ['urgent'])

// ── bill: unpaid and due ──
it = one({ expenses: [bill()] }, 'bill')
assert.equal(it.severity, 'urgent'); assert.match(it.title, /9 days overdue/)
assert.deepEqual(sev({ expenses: [bill({ dueDate: '2026-10-24' })] }, 'bill'), ['soon'])
assert.equal(run({ expenses: [bill({ paid: true })] }, 'bill').length, 0)
assert.equal(run({ expenses: [bill({ dueDate: undefined })] }, 'bill').length, 0)                    // no due date: nothing to say
assert.equal(run({ expenses: [bill({ dueDate: '2026-12-01' })] }, 'bill').length, 0)

// ── balance: a settlement not paid in full, by how long it has been owed ──
assert.deepEqual(sev({ settlements: [settlement({ preparedOn: '2026-08-01' })] }, 'balance'), ['urgent'])   // 79 days
assert.deepEqual(sev({ settlements: [settlement({ preparedOn: '2026-10-05' })] }, 'balance'), ['soon'])     // 14 days
assert.deepEqual(sev({ settlements: [settlement({ preparedOn: '2026-10-17' })] }, 'balance'), ['info'])     // 2 days
assert.equal(one({ settlements: [settlement()] }, 'balance').amount, 7000)
assert.equal(run({ settlements: [settlement({ payments: [{ label: 'Paid', amount: 12000 }] })] }, 'balance').length, 0)

// ── deposits waiting to be split ──
it = one({ deposits: [{ done: false }, { done: false }, { done: true }] }, 'deposits')
assert.equal(it.severity, 'info'); assert.match(it.title, /2 deposits/)
assert.equal(run({ deposits: [{ done: true }] }, 'deposits').length, 0)

// ── offer_reply: the buyer wants an answer ──
const reply = (respondBy: string) => sev({ offers: [offer({ terms: { respondBy } as TourOffer['terms'] })] }, 'offer_reply')
assert.deepEqual(reply('2026-10-15'), ['urgent'])       // already late
assert.deepEqual(reply('2026-10-22'), ['urgent'])       // 3 days
assert.deepEqual(reply('2026-10-26'), ['soon'])         // 7 days
assert.deepEqual(reply('2026-11-10'), [])
assert.equal(run({ offers: [offer({ status: 'confirmed', terms: { respondBy: '2026-10-15' } as TourOffer['terms'] })] }, 'offer_reply').length, 0)   // no longer open

// ── offer_hold: a close hold that is still unconfirmed ──
assert.deepEqual(sev({ offers: [offer({ status: 'hold', date: '2026-10-30' })] }, 'offer_hold'), ['soon'])
assert.equal(run({ offers: [offer({ status: 'hold', date: '2026-12-30' })] }, 'offer_hold').length, 0)
assert.equal(run({ offers: [offer({ status: 'inquiry', date: '2026-10-30' })] }, 'offer_hold').length, 0)   // only a hold
assert.equal(run({ offers: [offer({ status: 'hold', date: '2026-10-01' })] }, 'offer_hold').length, 0)      // a date that has passed is not "close"

// ── sheet: the artist's answer to an offer sheet ──
assert.deepEqual(sev({ offers: [offer()], sheets: [sheet({ status: 'approved', respondedAt: '2026-10-18T10:00:00Z' })] }, 'sheet'), ['soon'])
assert.deepEqual(sev({ offers: [offer()], sheets: [sheet({ status: 'passed', respondedAt: '2026-10-18T10:00:00Z' })] }, 'sheet'), ['info'])
assert.deepEqual(sev({ offers: [offer()], sheets: [sheet({ status: 'sent', sentAt: '2026-10-10T12:00:00Z' })] }, 'sheet'), ['soon'])      // waiting 9 days
assert.equal(run({ offers: [offer()], sheets: [sheet({ status: 'sent', sentAt: '2026-10-18T12:00:00Z' })] }, 'sheet').length, 0)          // only a day

// ── no_settlement: the show happened, nothing entered ──
const played = (days: number, o: Partial<Show> = {}) => show({ date: new Date(Date.parse(TODAY + 'T00:00:00Z') - days * 86_400_000).toISOString().slice(0, 10), ...o })
assert.deepEqual(sev({ shows: [played(4)] }, 'no_settlement'), ['info'])
assert.deepEqual(sev({ shows: [played(10)] }, 'no_settlement'), ['soon'])
assert.deepEqual(sev({ shows: [played(25)] }, 'no_settlement'), ['urgent'])
assert.equal(run({ shows: [played(2)] }, 'no_settlement').length, 0)                                       // give it a few days
assert.equal(run({ shows: [played(25, { historyOnly: true })] }, 'no_settlement').length, 0)
assert.equal(run({ shows: [played(25, { status: 'hold' })] }, 'no_settlement').length, 0)
assert.equal(run({ shows: [played(25, { id: 'sX' })], settlements: [settlement()] }, 'no_settlement').length, 0)   // settlement exists

// ── no_budget: a show coming up with no budget ──
const ahead = (days: number, o: Partial<Show> = {}) => show({ date: new Date(Date.parse(TODAY + 'T00:00:00Z') + days * 86_400_000).toISOString().slice(0, 10), ...o })
assert.deepEqual(sev({ shows: [ahead(10)] }, 'no_budget'), ['info'])
assert.equal(run({ shows: [ahead(40)] }, 'no_budget').length, 0)
assert.equal(run({ shows: [ahead(10)], budgets: [{ showId: 's1' }] }, 'no_budget').length, 0)

// ── empty: nothing financial recorded at all ──
assert.deepEqual(sev({ shows: [ahead(10)] }, 'empty'), ['info'])
assert.equal(run({ shows: [ahead(10)], invoices: [invoice({ status: 'paid' })] }, 'empty').length, 0)
assert.equal(run({}, 'empty').length, 0)                                                                    // no shows: nothing to be missing

// ── contract: expired, ending soon, flagged ──
it = one({ contracts: [contract({ expiryDate: '2026-10-01' })] }, 'contract')
assert.equal(it.severity, 'urgent'); assert.match(it.title, /expired 18 days ago/); assert.deepEqual(it.go, { section: 'legal', sub: 'alerts' })
assert.deepEqual(sev({ contracts: [contract({ expiryDate: '2026-11-05' })] }, 'contract'), ['soon'])       // 17 days
assert.deepEqual(sev({ contracts: [contract({ expiryDate: '2026-12-31' })] }, 'contract'), ['info'])       // 73 days
assert.match(one({ contracts: [contract({ expiryDate: TODAY })] }, 'contract').title, /ends today/)         // the day it ends is not missed
assert.equal(run({ contracts: [contract({ expiryDate: '2028-01-01' })] }, 'contract').length, 0)
assert.equal(run({ contracts: [contract({ status: 'draft', expiryDate: '2026-01-01' })] }, 'contract').length, 0)      // a draft cannot expire
assert.equal(run({ contracts: [contract({ status: 'terminated', expiryDate: '2026-01-01' })] }, 'contract').length, 0)
assert.deepEqual(sev({ contracts: [contract({ flagged: true })] }, 'contract'), ['soon'])
assert.equal(run({ contracts: [contract({ expiryDate: '2026-10-01', flagged: true })] }, 'contract').length, 1)         // one item, not two

// ── project: overdue, or unassigned and due soon ──
it = one({ projects: [project()] }, 'project')
assert.equal(it.severity, 'soon'); assert.match(it.title, /3 days overdue/); assert.equal(it.detail, 'Nobody is assigned to it')
assert.deepEqual(sev({ projects: [project({ dueDate: '2026-10-05', assigneeId: 'u1' })] }, 'project'), ['urgent'])   // 14 days late
assert.equal(one({ projects: [project({ dueDate: '2026-10-05', assigneeId: 'u1' })] }, 'project').detail, undefined)
assert.deepEqual(sev({ projects: [project({ dueDate: '2026-10-22' })] }, 'project'), ['soon'])                      // unassigned, due in 3 days
assert.equal(run({ projects: [project({ dueDate: '2026-10-22', assigneeId: 'u1' })] }, 'project').length, 0)       // somebody has it
assert.equal(run({ projects: [project({ dueDate: '2026-12-22' })] }, 'project').length, 0)
assert.equal(run({ projects: [project({ status: 'done' })] }, 'project').length, 0)
assert.equal(run({ projects: [project({ dueDate: undefined })] }, 'project').length, 0)

// ── who sees what ──
const everything: Parts = {
  invoices: [invoice()], expenses: [bill()], settlements: [settlement({ preparedOn: '2026-08-01' })], deposits: [{ done: false }],
  offers: [offer({ status: 'hold', date: '2026-10-30' })], shows: [played(25), ahead(10, { id: 's2' })], contracts: [contract({ expiryDate: '2026-10-01' })], projects: [project()],
}
const rulesFor = (a: InboxAccess) => new Set(buildInbox(client(everything), TODAY, a).map(i => i.rule))
assert.deepEqual([...rulesFor(NONE)], [])
assert.deepEqual([...rulesFor({ ...NONE, finance: true })].sort(), ['balance', 'bill', 'deposits', 'invoice'])
assert.deepEqual([...rulesFor({ ...NONE, deals: true })], ['offer_hold'])
assert.deepEqual([...rulesFor({ ...NONE, legal: true })], ['contract'])
assert.deepEqual([...rulesFor({ ...NONE, projects: true })], ['project'])
assert.deepEqual([...rulesFor({ ...NONE, tour: true })], [])                                               // show money items need Tour AND Finance
assert.ok(rulesFor({ ...NONE, tour: true, finance: true }).has('no_settlement'))

// ── a demo artist raises alerts like any other, marked as practice data ──
const demoItems = buildInbox(client({ ...everything, isDemo: true }), TODAY, ALL)
assert.ok(demoItems.length > 0)
assert.ok(demoItems.every(i => i.demo === true))
assert.ok(buildInbox(client(everything), TODAY, ALL).every(i => i.demo === undefined))

// ── ordering and done / snoozed ──
const ordered = buildInbox(client(everything), TODAY, ALL)
const rank = { urgent: 0, soon: 1, info: 2 }
assert.deepEqual(ordered.map(i => rank[i.severity]), [...ordered.map(i => rank[i.severity])].sort((a, b) => a - b))
assert.equal(new Set(ordered.map(i => i.key)).size, ordered.length)                                       // every item has its own key
assert.equal(isHidden(undefined, TODAY), false)
assert.equal(isHidden({ state: 'done' }, TODAY), true)
assert.equal(isHidden({ state: 'snoozed', until: '2026-10-20' }, TODAY), true)
assert.equal(isHidden({ state: 'snoozed', until: '2026-10-19' }, TODAY), false)                           // the snooze ends today
// worse is a new item: the key includes how urgent it is, so "done" does not hide it once it gets worse
assert.notEqual(one({ invoices: [invoice({ dueDate: '2026-10-22' })] }, 'invoice').key, one({ invoices: [invoice()] }, 'invoice').key)

console.log('inbox checks passed')
