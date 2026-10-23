// Checks the "All artists" Tour page: the show table, the offer board, who sees which part, and the totals.
// Run with:  npx tsx scripts/check-roster-tour.ts
import assert from 'node:assert/strict'
import { OFFER_COLUMNS, buildRosterTour, filterRows, tourAccessFor, tourCapabilities, tourStats, type TourAccess } from '../src/lib/roster-tour'
import type { Client, Invoice, MainSection, Settlement, Show, ShowAdvance, TourOffer, UserRole } from '../src/types'

const TODAY = '2026-10-21'
const FULL: TourAccess = { shows: true, showsFully: true, deals: true, dealsFully: true, finance: true }
const NO_MONEY: TourAccess = { ...FULL, finance: false }
const NONE: TourAccess = { shows: false, showsFully: false, deals: false, dealsFully: false, finance: false }

const show = (o: Partial<Show> & { id: string; date: string }): Show => ({ city: 'Berlin', venue: 'Tresor', time: '20:00', status: 'confirmed', ...o })
const offer = (o: Partial<TourOffer> & { id: string; date: string }): TourOffer => ({ venue: 'Fabric', city: 'London', country: 'UK', promoter: 'Fabric Ltd', guarantee: 5000, status: 'inquiry', ...o })
const artist = (id: string, name: string, o: { shows?: Show[]; offers?: TourOffer[]; advances?: ShowAdvance[]; invoices?: Invoice[]; settlements?: Settlement[]; isDemo?: boolean } = {}): Client => ({
  id, name, color: `#${id}`, isDemo: o.isDemo,
  tour: { shows: o.shows ?? [], advances: o.advances ?? [], travel: [], guestList: [] },
  finance: { budgets: [], invoices: o.invoices ?? [], settlements: o.settlements ?? [] },
  business: { banking: { deposits: [] } },
  agentData: { offers: o.offers ?? [] },
}) as unknown as Client
const ids = (xs: { showId?: string; offerId?: string }[]) => xs.map(x => x.showId ?? x.offerId)

// ── the table: every artist's shows in one list, by date, each with its artist ──
const alpha = artist('a', 'Alpha', { shows: [
  show({ id: 'a-late', date: '2026-12-01', city: 'Rome', guarantee: 3000, currency: 'EUR' }),
  show({ id: 'a-played', date: '2026-09-01' }),
  show({ id: 'a-hold', date: '2026-10-28', status: 'hold', guarantee: 2000 }),
  show({ id: 'a-cancel', date: '2026-11-05', status: 'cancelled' }),
] })
const beta = artist('b', 'Beta', { shows: [
  show({ id: 'b-next', date: '2026-10-25', city: 'Lyon', guarantee: 4000 }),
  show({ id: 'b-tie', date: '2026-10-28', city: 'Oslo', guarantee: 1000 }),
  show({ id: 'b-hist', date: '2025-05-05', historyOnly: true }),
  show({ id: 'b-lapsed', date: '2026-10-01', status: 'hold' }),
] })
const { rows } = buildRosterTour([{ client: beta, access: FULL }, { client: alpha, access: FULL }], TODAY)
assert.deepEqual(ids(rows), ['b-hist', 'a-played', 'b-lapsed', 'b-next', 'a-hold', 'b-tie', 'a-cancel', 'a-late'], 'by date; the same date by artist name (Alpha before Beta)')
const row = (id: string) => rows.find(r => r.showId === id)!
assert.deepEqual([row('b-next').clientName, row('b-next').clientColor, row('b-next').days], ['Beta', '#b', 4])

// a show kept only as history is played and never ahead, even if its date is wrong or in the future
const histFuture = buildRosterTour([{ client: artist('h', 'H', { shows: [show({ id: 'h1', date: '2026-11-20', historyOnly: true }), show({ id: 'h2', date: '2026-11-21', historyOnly: true, status: 'hold' })] }), access: FULL }], TODAY).rows
assert.deepEqual(histFuture.map(r => [r.state, r.ahead]), [['played', false], ['played', false]])

// ── what each show is: confirmed, hold, cancelled, played, or a hold that lapsed ──
assert.deepEqual(['b-next', 'a-hold', 'a-cancel', 'a-played', 'b-lapsed', 'b-hist'].map(id => row(id).state), ['confirmed', 'hold', 'cancelled', 'played', 'lapsed', 'played'])
assert.deepEqual(['b-next', 'a-hold', 'a-cancel', 'a-played', 'b-lapsed', 'b-hist'].map(id => row(id).ahead), [true, true, true, false, false, false], 'a history-only show is never ahead')
assert.equal(buildRosterTour([{ client: artist('c', 'C', { shows: [show({ id: 'today', date: TODAY })] }), access: FULL }], TODAY).rows[0].ahead, true, 'a show today is still ahead')

// ── filters: ahead soonest first, played most recent first, one artist ──
assert.deepEqual(ids(filterRows(rows, { when: 'upcoming' })), ['b-next', 'a-hold', 'b-tie', 'a-cancel', 'a-late'])
assert.deepEqual(ids(filterRows(rows, { when: 'played' })), ['b-lapsed', 'a-played', 'b-hist'], 'most recent first')
assert.equal(filterRows(rows, { when: 'all' }).length, 8)
assert.deepEqual(ids(filterRows(rows, { when: 'upcoming', clientId: 'a' })), ['a-hold', 'a-cancel', 'a-late'])
assert.deepEqual(ids(filterRows(rows, { when: 'all', clientId: 'nobody' })), [])
const before = rows.map(r => r.showId); filterRows(rows, { when: 'played' }); assert.deepEqual(rows.map(r => r.showId), before, 'filtering never reorders the original list')

// ── fees are Deals & fees: only where that page is fully open ──
assert.deepEqual(row('a-late').fee, { amount: 3000, currency: 'EUR' })
assert.deepEqual(row('b-next').fee, { amount: 4000, currency: 'USD' }, 'no currency means dollars')
assert.equal(row('a-played').fee, undefined, 'no fee recorded: none shown')
const noDeals = buildRosterTour([{ client: beta, access: { ...FULL, deals: false, dealsFully: false } }], TODAY)
assert.ok(noDeals.rows.every(r => r.fee === undefined), 'without Deals & fees no fee shows')
assert.deepEqual(ids(noDeals.rows).length, 4, '...but the shows still do')
const shared = buildRosterTour([{ client: beta, access: { ...FULL, dealsFully: false } }], TODAY)
assert.ok(shared.rows.every(r => r.fee === undefined), 'a fee is shown only when the whole Deals page is open')

// ── the next step is the show's own (and not for a shared show, a history show, a cancelled or lapsed one) ──
assert.deepEqual(row('b-next').next, { label: 'Start the advance', link: { section: 'tour', sub: 'advance' } })
assert.equal(row('a-hold').next?.label, 'Confirm the hold')
assert.equal(row('a-cancel').next, undefined); assert.equal(row('b-lapsed').next, undefined); assert.equal(row('b-hist').next, undefined)
assert.equal(row('a-played').next?.label, 'Add the settlement', 'a played show with no settlement: that is the job')
// without all of Finance, a money step is not worked out (the settlement may simply be one they cannot load)
const noMoney = buildRosterTour([{ client: alpha, access: NO_MONEY }], TODAY).rows
assert.equal(noMoney.find(r => r.showId === 'a-played')!.next, undefined)
assert.equal(noMoney.find(r => r.showId === 'a-hold')!.next?.label, 'Confirm the hold', 'steps that are not money still show')
// the invoice step is in Finance, so it is hidden the same way: a played show, settlement entered, invoice still to chase
const inv = { id: 'inv1', number: 'INV-1', to: 'Promoter', category: 'Shows', status: 'sent', issuedDate: '2026-09-11', dueDate: '2026-10-11', items: [{ description: 'Fee', quantity: 1, rate: 1000 }], currency: 'USD' } as unknown as Invoice
const st = { id: 'st1', showIds: ['p-inv'], currency: 'USD', totalDue: 1000, payments: [] } as unknown as Settlement
const waitingOnInvoice = artist('i', 'Iota', { shows: [show({ id: 'p-inv', date: '2026-09-10', invoiceId: 'inv1' })], invoices: [inv], settlements: [st] })
assert.equal(buildRosterTour([{ client: waitingOnInvoice, access: FULL }], TODAY).rows[0].next?.label, 'Chase the invoice')
assert.equal(buildRosterTour([{ client: waitingOnInvoice, access: NO_MONEY }], TODAY).rows[0].next, undefined)
// a single shared show: listed, but nothing is worked out for it
const sharedShow = buildRosterTour([{ client: alpha, access: { ...FULL, showsFully: false } }], TODAY).rows
assert.ok(sharedShow.every(r => r.next === undefined && r.full === false))
assert.equal(sharedShow.length, 4)

// ── no Tour access: no rows at all ──
assert.deepEqual(buildRosterTour([{ client: alpha, access: NONE }], TODAY), { rows: [], offers: [] })
assert.deepEqual(buildRosterTour([], TODAY), { rows: [], offers: [] })

// ── the offer board: inquiries, holds and confirmed offers, soonest first ──
const gamma = artist('g', 'Gamma', { offers: [
  offer({ id: 'o-late', date: '2026-12-10', status: 'hold' }),
  offer({ id: 'o-conf', date: '2026-11-02', status: 'confirmed', guarantee: 9000, terms: { respondBy: '2026-10-25' } }),
  offer({ id: 'o-conf-past', date: '2026-09-15', status: 'confirmed' }),
  offer({ id: 'o-set', date: '2026-08-01', status: 'settled' }),
  offer({ id: 'o-can', date: '2026-11-09', status: 'cancelled' }),
  offer({ id: 'o-soon', date: '2026-10-30', status: 'inquiry', viaAgency: true, terms: { respondBy: '2026-10-23' } }),
  offer({ id: 'o-old', date: '2026-10-01', status: 'inquiry' }),
] })
const board = buildRosterTour([{ client: gamma, access: FULL }], TODAY).offers
assert.deepEqual(ids(board), ['o-conf-past', 'o-old', 'o-soon', 'o-conf', 'o-late'], 'settled and cancelled are not on the board')
assert.deepEqual(OFFER_COLUMNS, ['inquiry', 'hold', 'confirmed'])
const card = (id: string) => board.find(o => o.offerId === id)!
assert.equal(card('o-soon').viaAgency, true); assert.equal(card('o-late').viaAgency, false)
assert.deepEqual(card('o-soon').reply, { label: 'Reply by Oct 23', tone: 'soon' })
assert.equal(card('o-late').reply, undefined, 'no reply-by date: no badge')
assert.deepEqual([card('o-old').datePassed, card('o-soon').datePassed, card('o-conf').datePassed, card('o-conf-past').datePassed], [true, false, false, false], 'only an inquiry or hold can have its date pass; a confirmed offer is a show')
assert.equal(card('o-conf').reply, undefined, 'a confirmed offer is not waiting for a reply, even with a reply-by date on it')
assert.deepEqual([card('o-conf').guarantee, card('o-conf').clientName, card('o-conf').days], [9000, 'Gamma', 12])
// offers are Deals & fees: not with Tour alone
assert.deepEqual(buildRosterTour([{ client: gamma, access: { ...FULL, deals: false, dealsFully: false } }], TODAY).offers, [])
// Deals & fees without Tour: the offers, and no shows
const dealsOnly = buildRosterTour([{ client: artist('d', 'Delta', { shows: [show({ id: 'd1', date: '2026-11-01' })], offers: [offer({ id: 'o1', date: '2026-11-20' })] }), access: { ...NONE, deals: true, dealsFully: true } }], TODAY)
assert.deepEqual([ids(dealsOnly.rows), ids(dealsOnly.offers)], [[], ['o1']])

// ── the numbers at the top ──
const all = buildRosterTour([{ client: alpha, access: FULL }, { client: beta, access: FULL }, { client: gamma, access: FULL }], TODAY)
assert.deepEqual(tourStats(all.rows, all.offers), {
  ahead: 4,                       // b-next, a-hold, b-tie, a-late: the cancelled show and everything played are not ahead
  holds: 1,
  openOffers: 3,                  // o-old, o-soon, o-late (the confirmed one is a show, not an open offer)
  fees: '$5,000 · €3,000',        // confirmed shows ahead with a fee: b-next $4,000 + b-tie $1,000 (the hold is not counted) and a-late €3,000
})
// no fees to show without Deals & fees, and none worked out from a single shared show
assert.equal(tourStats(noDeals.rows, noDeals.offers).fees, '')
assert.equal(tourStats(shared.rows, shared.offers).fees, '')
assert.equal(tourStats(sharedShow, []).fees, '')
assert.deepEqual(tourStats([], []), { ahead: 0, holds: 0, openOffers: 0, fees: '' })

// ── a practice artist is listed (marked) but never counted ──
const practice = artist('p', 'Practice', { isDemo: true, shows: [show({ id: 'p1', date: '2026-11-01', guarantee: 50000 }), show({ id: 'p2', date: '2026-11-02', status: 'hold' })], offers: [offer({ id: 'po', date: '2026-11-10', status: 'inquiry' })] })
const withPractice = buildRosterTour([{ client: alpha, access: FULL }, { client: practice, access: FULL }], TODAY)
assert.deepEqual(withPractice.rows.filter(r => r.demo).map(r => r.showId), ['p1', 'p2'], 'its shows are in the table, marked')
assert.deepEqual(withPractice.rows.filter(r => !r.demo).every(r => r.demo === false), true)
assert.equal(withPractice.offers.find(o => o.offerId === 'po')!.demo, true)
assert.deepEqual(tourStats(withPractice.rows, withPractice.offers), tourStats(buildRosterTour([{ client: alpha, access: FULL }], TODAY).rows, []), 'the totals are the same with or without it')

// ── counts and totals come only from artists whose whole Tour page is open ──
const sharedA = artist('s', 'Shared', { shows: [show({ id: 's1', date: '2026-11-01', guarantee: 9000 }), show({ id: 's2', date: '2026-11-02', status: 'hold' })] })
const sharedOnly = buildRosterTour([{ client: sharedA, access: { ...FULL, showsFully: false } }], TODAY)
assert.equal(sharedOnly.rows.length, 2, 'the shared shows are listed')
assert.deepEqual(tourStats(sharedOnly.rows, []), { ahead: 0, holds: 0, openOffers: 0, fees: '' }, 'but nothing is counted from them')
const mixed = buildRosterTour([{ client: sharedA, access: { ...FULL, showsFully: false } }, { client: beta, access: FULL }], TODAY)
assert.deepEqual([tourStats(mixed.rows, []).ahead, tourStats(mixed.rows, []).holds], [2, 0], "only Beta's two shows ahead (b-next, b-tie), none of the shared ones")

// ── edge cases found in review ──
assert.equal(buildRosterTour([{ client: artist('z', 'Z', { shows: [show({ id: 'z0', date: '2026-11-01', guarantee: 0 })] }), access: FULL }], TODAY).rows[0].fee, undefined, 'a $0 fee is no fee')
assert.equal(buildRosterTour([{ client: artist('z', 'Z', { shows: [show({ id: 'z1', date: '2025-01-01', historyOnly: true, status: 'cancelled' })] }), access: FULL }], TODAY).rows[0].state, 'cancelled', 'a cancelled show stays cancelled even if kept as history')
assert.equal(buildRosterTour([{ client: artist('z', 'Z', { offers: [offer({ id: 'today', date: TODAY, status: 'hold' })] }), access: FULL }], TODAY).offers[0].datePassed, false, 'an offer dated today has not passed')
// played, same date: most recent date first, then artists A to Z
const tie = buildRosterTour([{ client: artist('z', 'Zeta', { shows: [show({ id: 'zz', date: '2026-09-01' })] }), access: FULL }, { client: artist('a', 'Alpha', { shows: [show({ id: 'aa', date: '2026-09-01' }), show({ id: 'a2', date: '2026-09-10' })] }), access: FULL }], TODAY)
assert.deepEqual(ids(filterRows(tie.rows, { when: 'played' })), ['a2', 'aa', 'zz'])
// a played show whose settlement is entered with a balance and no invoice: "Collect the balance" is a money step too
const owedShow = artist('o', 'Omega', { shows: [show({ id: 'o1', date: '2026-09-10' })], settlements: [{ id: 'st9', showIds: ['o1'], currency: 'USD', totalDue: 1000, payments: [] } as unknown as Settlement] })
assert.equal(buildRosterTour([{ client: owedShow, access: FULL }], TODAY).rows[0].next?.label, 'Collect the balance')
assert.equal(buildRosterTour([{ client: owedShow, access: NO_MONEY }], TODAY).rows[0].next, undefined)

// ── the access flags: whole pages vs single shared items ──
const grants = (map: Record<string, MainSection[]>, shareOnly: Record<string, MainSection[]> = {}) => ({
  has: (s: MainSection, id: string) => (map[id] ?? []).includes(s) || (shareOnly[id] ?? []).includes(s),
  shareOnly: (s: MainSection, id: string) => (shareOnly[id] ?? []).includes(s),
})
const flags = (g: ReturnType<typeof grants>, id = 'x', role: UserRole = 'manager') => tourAccessFor(g.has, g.shareOnly, id, role)
assert.deepEqual(flags(grants({ x: ['tour', 'deals', 'finance'] })), FULL)
assert.deepEqual(flags(grants({ x: ['tour'] })), { shows: true, showsFully: true, deals: false, dealsFully: false, finance: false })
assert.deepEqual(flags(grants({ x: ['deals'] })), { shows: false, showsFully: false, deals: true, dealsFully: true, finance: false }, 'Deals & fees alone')
assert.deepEqual(flags(grants({}, { x: ['tour'] })), { shows: true, showsFully: false, deals: false, dealsFully: false, finance: false }, 'one show sent to them')
assert.deepEqual(flags(grants({ x: ['tour'] }, { x: ['finance'] })), { shows: true, showsFully: true, deals: false, dealsFully: false, finance: false }, 'one invoice sent to them is not Finance')
assert.deepEqual(flags(grants({ y: ['tour'] })), NONE, 'another artist')
// an artist's own login (the rules say yes to most pages for them): their schedule, and nothing management works out from it
assert.deepEqual(flags(grants({ x: ['tour', 'finance', 'deals'] }), 'x', 'artist'), { shows: true, showsFully: false, deals: false, dealsFully: false, finance: false })
assert.deepEqual(flags(grants({}), 'x', 'artist'), NONE, 'an artist with no Tour access sees nothing')

// ── what the page can offer, from all the person's artists together ──
const caps = (...a: TourAccess[]) => tourCapabilities(a)
assert.deepEqual(caps(FULL), { shows: true, offers: true, counts: true })
assert.deepEqual(caps(), { shows: false, offers: false, counts: false })
assert.deepEqual(caps(NONE), { shows: false, offers: false, counts: false })
assert.deepEqual(caps({ ...NONE, deals: true, dealsFully: true }), { shows: false, offers: true, counts: false }, 'Deals & fees alone: the offers, no shows, no show counts')
assert.deepEqual(caps({ ...NONE, shows: true, showsFully: true }), { shows: true, offers: false, counts: true }, 'Tour alone: no offers')
assert.deepEqual(caps({ ...NONE, shows: true }), { shows: true, offers: false, counts: false }, 'only single shared shows: listed, but no counts')
assert.deepEqual(caps({ ...NONE, shows: true }, FULL), { shows: true, offers: true, counts: true }, 'one artist fully open is enough for the counts')

console.log('roster-tour checks passed')
