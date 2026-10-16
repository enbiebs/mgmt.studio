// Checks budget assumptions (travel lines worked out from a few plain assumptions, promoter contributions taken off the
// cost, offer terms into a new budget) and the travel estimates / booking prompts.  Run with:  npx tsx scripts/check-budget-assumptions.ts
import assert from 'node:assert/strict'
import {
  applyTravelLines, assumptionsSummary, buildBudgetFromOffer, computeTravelLines, defaultAssumptions, fillFromOffer,
  nightsBetween, promoterCovers, termLines, touringParty,
} from '../src/lib/budget-assumptions'
import { bookingLinks, bookingTodo, historyEstimate, median } from '../src/lib/travel-estimates'
import { computeBudget, newLine } from '../src/lib/budget'
import { readEstimate, sourcesFrom } from '../src/lib/travel-estimate-server'
import type { Budget, BudgetAssumptions, Client, TourOffer, TravelItem } from '../src/types'

const TODAY = '2026-10-16'
const fmt = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
const convert = (n: number, from: string, to: string) => (from === to ? n : from === 'USD' && to === 'EUR' ? n * 0.9 : from === 'EUR' && to === 'USD' ? n / 0.9 : n)
const same = (n: number, from: string, to: string) => (void from, void to, n)

function client(over: { travel?: TravelItem[]; shows?: Client['tour']['shows']; crew?: number; crewRates?: number } = {}): Client {
  const crew = Array.from({ length: over.crew ?? 3 }, (_, i) => ({ id: `m${i}`, personId: `p${i}`, role: 'Tour Manager' }))
  const touring = Array.from({ length: over.crewRates ?? 2 }, (_, i) => ({ crewMemberId: `m${i}`, toursWithArtist: true, rateUnit: 'show', rateShow: 500 }))
  const notTouring = crew.length > touring.length ? [{ crewMemberId: `m${touring.length}`, toursWithArtist: false, rateUnit: 'show', rateShow: 400 }] : []
  return {
    id: 'c1', name: 'Artist', people: crew.map((m, i) => ({ id: `p${i}`, name: `Crew ${i}` })),
    tour: { shows: over.shows ?? [], crew, travel: over.travel ?? [] },
    finance: { crewRates: [...touring, ...notTouring], budgets: [], invoices: [], expenses: [] },
    agentData: { offers: [] },
  } as unknown as Client
}
const offer = (o: Partial<TourOffer> = {}): TourOffer => ({ id: 'o1', venue: 'LX Factory', city: 'Lisbon', country: 'PT', date: '2026-11-20', promoter: 'P', guarantee: 10000, status: 'confirmed', ...o } as TourOffer)

// ── nights and the touring party ──
assert.equal(nightsBetween('2026-11-19', '2026-11-21'), 2)
assert.equal(nightsBetween('2026-11-19', '2026-11-19'), 0)
assert.equal(nightsBetween('2026-11-21', '2026-11-19'), 0)
assert.equal(nightsBetween(undefined, '2026-11-19'), 0)
assert.equal(nightsBetween('nonsense', '2026-11-19'), 0)
assert.equal(touringParty(client()), 3)                       // the artist plus two crew who tour; the third has a rate but does not tour
assert.equal(touringParty(client({ crew: 0, crewRates: 0 })), 1)

// ── starting assumptions ──
const d = defaultAssumptions(client(), undefined, offer())
assert.deepEqual(d, { travelers: 3, rooms: 3, to: 'Lisbon', arrive: '2026-11-19', depart: '2026-11-21' })
assert.deepEqual(defaultAssumptions(client(), { date: '2026-12-01', city: '  Berlin ' }), { travelers: 3, rooms: 3, to: 'Berlin', arrive: '2026-11-30', depart: '2026-12-02' })
assert.equal(defaultAssumptions(client()).arrive, undefined)

// ── the promoter's contribution (written in dollars on the offer), in the budget's currency ──
assert.deepEqual(promoterCovers({ airfare: 500, hotel: 300 }, convert, 'USD'), { flight: 500, hotel: 300, ground: 0 })
assert.deepEqual(promoterCovers({ groundTransport: 100 }, convert, 'EUR'), { flight: 0, hotel: 0, ground: 90 })
assert.deepEqual(promoterCovers(undefined, convert, 'USD'), { flight: 0, hotel: 0, ground: 0 })

// ── working the lines out ──
const none = { flight: 0, hotel: 0, ground: 0 }
const A: BudgetAssumptions = {
  travelers: 3, rooms: 2, to: 'Lisbon', from: 'Los Angeles', arrive: '2026-11-19', depart: '2026-11-21',
  flight: { amount: 900, source: 'web' }, hotel: { amount: 200, source: 'history' }, ground: { amount: 400, source: 'typed' },
}
let lines = computeTravelLines(A, none, fmt)
assert.deepEqual(lines.map(l => [l.kind, l.bucket, l.gross, l.net]), [['flight', 'airfare', 2700, 2700], ['hotel', 'hotels', 800, 800], ['ground', 'local_transport', 400, 400]])
assert.equal(lines[0].basis, '3 people × $900 round trip')
assert.equal(lines[1].basis, '2 rooms × 2 nights × $200')
// what the promoter covers comes OFF the cost
lines = computeTravelLines(A, { flight: 500, hotel: 300, ground: 0 }, fmt)
assert.deepEqual(lines.map(l => [l.gross, l.promoterCovers, l.net]), [[2700, 500, 2200], [800, 300, 500], [400, 0, 400]])
assert.equal(lines[0].basis, '3 people × $900 round trip − $500 the promoter covers')
// …but never below zero, however much they offer
lines = computeTravelLines(A, { flight: 99999, hotel: 99999, ground: 99999 }, fmt)
assert.deepEqual(lines.map(l => [l.promoterCovers, l.net]), [[2700, 0], [800, 0], [400, 0]])
// singular wording
assert.equal(computeTravelLines({ ...A, travelers: 1, rooms: 1, arrive: '2026-11-20', depart: '2026-11-21' }, none, fmt)[1].basis, '1 room × 1 night × $200')
assert.equal(computeTravelLines({ ...A, travelers: 1 }, none, fmt)[0].basis, '1 person × $900 round trip')
// a kind missing what it needs is left out (no nights, no estimate, nobody travelling)
assert.deepEqual(computeTravelLines({ ...A, arrive: undefined }, none, fmt).map(l => l.kind), ['flight', 'ground'])
assert.deepEqual(computeTravelLines({ ...A, flight: undefined, ground: { amount: 0, source: 'typed' } }, none, fmt).map(l => l.kind), ['hotel'])
assert.deepEqual(computeTravelLines({ ...A, travelers: 0 }, none, fmt).map(l => l.kind), ['hotel', 'ground'])
assert.deepEqual(computeTravelLines({ travelers: 3, rooms: 3 }, none, fmt), [])

// ── writing them into a budget: only lines that are 0 or already worked out ──
const base = buildBudgetFromOffer({ client: client(), offer: offer() })
const computed = computeTravelLines(A, { flight: 500, hotel: 300, ground: 0 }, fmt)
let res = applyTravelLines(base.lines, computed)
assert.deepEqual(res.applied, ['airfare', 'hotels', 'local_transport']); assert.deepEqual(res.skipped, [])
const lineOf = (ls: typeof base.lines, bucket: string) => ls.find(l => l.bucket === bucket)!
assert.equal(lineOf(res.lines, 'airfare').amount, 2200); assert.equal(lineOf(res.lines, 'airfare').calc?.promoterCovers, 500)
assert.equal(lineOf(res.lines, 'hotels').amount, 500); assert.equal(lineOf(res.lines, 'local_transport').amount, 400)
assert.equal(res.lines.length, base.lines.length)                                         // the existing lines are used, none added
// the same inputs again change nothing
assert.equal(applyTravelLines(res.lines, computed).lines.map(l => l.amount).join(), res.lines.map(l => l.amount).join())
// a worked-out line follows a new estimate
const cheaper = computeTravelLines({ ...A, flight: { amount: 700, source: 'web' } }, { flight: 500, hotel: 300, ground: 0 }, fmt)
assert.equal(lineOf(applyTravelLines(res.lines, cheaper).lines, 'airfare').amount, 1600)
// a figure someone typed is left alone and reported
const typed = res.lines.map(l => (l.bucket === 'airfare' ? { ...l, amount: 1234, calc: undefined } : l))
res = applyTravelLines(typed, cheaper)
assert.deepEqual(res.skipped, ['airfare']); assert.equal(lineOf(res.lines, 'airfare').amount, 1234)
// …unless it is replaced on purpose
res = applyTravelLines(typed, cheaper, { force: ['airfare'] })
assert.equal(lineOf(res.lines, 'airfare').amount, 1600); assert.ok(lineOf(res.lines, 'airfare').calc)
// an estimate taken away puts its worked-out line back to 0
res = applyTravelLines(applyTravelLines(base.lines, computed).lines, computed.filter(c => c.kind !== 'hotel'))
assert.equal(lineOf(res.lines, 'hotels').amount, 0); assert.equal(lineOf(res.lines, 'hotels').calc, undefined)
assert.deepEqual(res.cleared, ['hotels']); assert.deepEqual(res.applied, [])                    // reported as taken back to 0, never as something added
// a budget with no travel line gets one
const bare = [newLine('guarantee', 'Guarantee', 10000)]
assert.equal(applyTravelLines(bare, computed).lines.filter(l => l.bucket === 'airfare').length, 1)
// nothing to do: the very same list comes back
const untouched = applyTravelLines(base.lines, [])
assert.equal(untouched.lines, base.lines); assert.deepEqual(untouched.applied, [])

// ── offer terms in a new budget ──
const rich = offer({ buyout: 2000, terms: { bonuses: [{ atTickets: 850, amount: 750 }], airfare: 500, hotel: 300, groundTransport: 100 } })
const built = buildBudgetFromOffer({ client: client(), offer: rich })
assert.equal(lineOf(built.lines, 'buyout').amount, 2000); assert.equal(lineOf(built.lines, 'buyout').section, 'income')
assert.equal(lineOf(built.lines, 'bonus').amount, 0)                                          // upside is not planned on
assert.equal(lineOf(built.lines, 'bonus').label, 'Bonuses (up to $750 if 850 tickets sell)')
assert.equal(computeBudget(built.lines, built.commissions).gross, 12000)                       // guarantee + buyout, no bonus
assert.deepEqual(built.assumptions, { travelers: 3, rooms: 3, to: 'Lisbon', arrive: '2026-11-19', depart: '2026-11-21' })
// no terms, no extra lines
const plain = buildBudgetFromOffer({ client: client(), offer: offer() })
assert.ok(!plain.lines.some(l => l.bucket === 'buyout' || l.bucket === 'bonus'))
assert.equal(termLines(offer({ terms: { bonuses: [{ atTickets: 500, amount: 250 }, { atTickets: 900, amount: 500 }] } }), [])[0].label, 'Bonuses (up to $750 more if ticket targets are met)')
assert.equal(termLines(rich, built.lines).length, 0)                                           // never twice

// ── "Fill in from the offer" on a budget that already exists ──
const ctx = { convert: same, fmt }
const old: Budget = { id: 'b1', name: 'Old', currency: 'USD', status: 'draft', version: 1, lines: buildBudgetFromOffer({ client: client(), offer: offer() }).lines, commissions: [] }
let fill = fillFromOffer(old, client(), rich, undefined, ctx)
assert.ok(fill.patch); assert.deepEqual(fill.added, ['starting assumptions', 'the production buyout', 'a Bonuses line'])
assert.equal(lineOf(fill.patch!.lines, 'buyout').amount, 2000)
assert.equal(fill.patch!.assumptions!.to, 'Lisbon')
// with estimates on the budget the travel lines (less the promoter's share) are filled too
const withEst: Budget = { ...old, assumptions: A }
fill = fillFromOffer(withEst, client(), rich, undefined, ctx)
assert.equal(lineOf(fill.patch!.lines, 'airfare').amount, 2200); assert.equal(lineOf(fill.patch!.lines, 'hotels').amount, 500); assert.equal(lineOf(fill.patch!.lines, 'local_transport').amount, 300)
// a number someone typed is never overwritten
const typedBudget: Budget = { ...withEst, lines: withEst.lines.map(l => (l.bucket === 'hotels' ? { ...l, amount: 999 } : l)) }
fill = fillFromOffer(typedBudget, client(), rich, undefined, ctx)
assert.deepEqual(fill.skipped, ['hotels']); assert.equal(lineOf(fill.patch!.lines, 'hotels').amount, 999)
// filling again changes nothing
const filled: Budget = { ...withEst, ...fillFromOffer(withEst, client(), rich, undefined, ctx).patch! }
assert.equal(fillFromOffer(filled, client(), rich, undefined, ctx).patch, null)

assert.equal(assumptionsSummary(A), '3 people · 2 nights · Los Angeles → Lisbon')
assert.equal(assumptionsSummary({ travelers: 1, rooms: 1 }), '1 person')
assert.equal(assumptionsSummary(undefined), '')

// ── estimates from the artist's own past trips ──
const leg = (fromCity: string, toCity: string) => ({ id: 'l' + fromCity + toCity, fromCity, toCity })
const flight = (o: Record<string, unknown>) => ({ id: 'f' + Math.random(), kind: 'flight', status: 'booked', traveler: 'Full Party', personIds: ['a', 'b'], legs: [leg('Los Angeles', 'Lisbon'), leg('Lisbon', 'Los Angeles')], cost: 2000, currency: 'USD', ...o }) as unknown as TravelItem
const hctx = { to: 'Lisbon, Portugal', currency: 'USD' as const, convert: same }
assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5); assert.equal(median([]), 0)

// round trips: per person, median of the bookings
let h = historyEstimate(client({ travel: [flight({ cost: 2000 }), flight({ cost: 3000, personIds: ['a', 'b', 'c'] }), flight({ cost: 2400 })] }), 'flight', hctx)!
assert.deepEqual([h.amount, h.low, h.high, h.samples], [1000, 1000, 1200, 3]); assert.match(h.note, /3 round-trip bookings to Lisbon, Portugal/)
// one-way into the city is doubled for the way home; both directions are added
h = historyEstimate(client({ travel: [flight({ legs: [leg('Los Angeles', 'Lisbon')], cost: 800, personIds: ['a'] })] }), 'flight', hctx)!
assert.equal(h.amount, 1600); assert.match(h.note, /doubled/)
h = historyEstimate(client({ travel: [flight({ legs: [leg('Los Angeles', 'Lisbon')], cost: 800, personIds: ['a'] }), flight({ legs: [leg('Lisbon', 'New York')], cost: 600, personIds: ['a'] })] }), 'flight', hctx)!
assert.equal(h.amount, 1400); assert.doesNotMatch(h.note, /doubled/)
// cancelled bookings, bookings with no cost, and bookings whose people cannot be told are ignored
assert.equal(historyEstimate(client({ travel: [flight({ status: 'cancelled' }), flight({ cost: undefined }), flight({ personIds: undefined })] }), 'flight', hctx), null)
assert.equal(historyEstimate(client({ travel: [flight({ personIds: undefined, traveler: 'Sam Rivera' })] }), 'flight', hctx)!.amount, 1000 * 2)   // a named traveller is one person: 2000 for the round trip
assert.equal(historyEstimate(client({ travel: [flight({ personIds: undefined, seats: '4' })] }), 'flight', hctx)!.amount, 500)
// another city is no history for this one; amounts are converted to the budget currency
assert.equal(historyEstimate(client({ travel: [flight({ legs: [leg('Los Angeles', 'Madrid'), leg('Madrid', 'Los Angeles')] })] }), 'flight', hctx), null)
assert.equal(historyEstimate(client({ travel: [flight({ currency: 'EUR', cost: 1800 })] }), 'flight', { ...hctx, currency: 'USD', convert })!.amount, 1000)
assert.equal(historyEstimate(client({ travel: [flight({})] }), 'flight', { ...hctx, to: '' }), null)

// hotels: per room per night, found through the show it was booked for or the address
const show = { id: 's1', date: '2026-11-20', city: 'Lisbon', venue: 'LX', time: '20:00', status: 'confirmed' } as Client['tour']['shows'][number]
const hotel = (o: Record<string, unknown>) => ({ id: 'h' + Math.random(), kind: 'hotel', status: 'booked', showIds: ['s1'], checkIn: '2026-11-19', checkOut: '2026-11-21', roomCount: 2, cost: 800, currency: 'USD', ...o }) as unknown as TravelItem
h = historyEstimate(client({ shows: [show], travel: [hotel({}), hotel({ cost: 1200 })] }), 'hotel', hctx)!
assert.deepEqual([h.amount, h.low, h.high, h.samples], [250, 200, 300, 2])               // 800 / 2 nights / 2 rooms = 200, 1200 -> 300
assert.equal(historyEstimate(client({ travel: [hotel({ showIds: undefined, address: '12 Rua Augusta, Lisbon' })] }), 'hotel', hctx)!.amount, 200)
assert.equal(historyEstimate(client({ shows: [show], travel: [hotel({ checkOut: undefined }), hotel({ checkOut: '2026-11-19' }), hotel({ cost: 0 }), hotel({ status: 'cancelled' })] }), 'hotel', hctx), null)
assert.equal(historyEstimate(client({ shows: [{ ...show, city: 'Madrid' }], travel: [hotel({})] }), 'hotel', hctx), null)

// ground: what was spent around one show, a cost shared by two shows counts half
const show2 = { ...show, id: 's2', date: '2026-12-01' }
const ground = (o: Record<string, unknown>) => ({ id: 'g' + Math.random(), kind: 'ground', status: 'booked', type: 'transfer', showIds: ['s1'], cost: 300, currency: 'USD', ...o }) as unknown as TravelItem
h = historyEstimate(client({ shows: [show], travel: [ground({}), ground({ cost: 100 })] }), 'ground', hctx)!
assert.deepEqual([h.amount, h.samples], [400, 1])
h = historyEstimate(client({ shows: [show, show2], travel: [ground({ showIds: ['s1', 's2'], cost: 600 }), ground({ showIds: ['s1'], cost: 100 })] }), 'ground', hctx)!
assert.deepEqual([h.amount, h.samples], [350, 2])                                          // s1: 300 (half of 600) + 100 = 400, s2: 300 -> median 350
assert.equal(historyEstimate(client({ shows: [show], travel: [] }), 'ground', hctx), null)

// ── booking prompts: a search with the trip filled in, nothing booked ──
const links = bookingLinks('flight', A)
assert.equal(links.length, 1); assert.equal(links[0].label, 'Google Flights')
assert.match(links[0].url, /^https:\/\/www\.google\.com\/travel\/flights\?q=/)
assert.match(decodeURIComponent(links[0].url), /Flights from Los Angeles to Lisbon on 2026-11-19 through 2026-11-21 for 3 passengers/)
assert.deepEqual(bookingLinks('flight', { ...A, from: undefined }), [])                      // a flight search needs to know where from
assert.deepEqual(bookingLinks('hotel', { ...A, to: '' }), [])
assert.deepEqual(bookingLinks('hotel', { ...A, arrive: undefined }), [])
const hotels = bookingLinks('hotel', A)
assert.deepEqual(hotels.map(l => l.label), ['Google Hotels', 'Booking.com'])
assert.match(hotels[1].url, /ss=Lisbon&checkin=2026-11-19&checkout=2026-11-21&group_adults=3&no_rooms=2/)
assert.ok(bookingLinks('hotel', { ...A, to: 'São Paulo & Co?x=1' }).every(l => !/Co\?x=1/.test(l.url)))   // typed text can never break out of the link
assert.match(bookingLinks('ground', A)[0].url, /^https:\/\/www\.kayak\.com\/cars\/Lisbon\/2026-11-19\/2026-11-21$/)
for (const k of ['flight', 'hotel', 'ground'] as const) for (const l of bookingLinks(k, A)) assert.ok(l.url.startsWith('https://'))

// the to-do a booking prompt adds
let todo = bookingTodo('flight', A, '$2,200', TODAY)
assert.equal(todo.title, 'Book flights: Los Angeles → Lisbon, Nov 19–Nov 21 (3 people)'); assert.equal(todo.dueDate, '2026-10-20'); assert.equal(todo.notes, 'Budgeted: $2,200')
todo = bookingTodo('hotel', { ...A, arrive: '2026-10-25', depart: '2026-10-27' }, undefined, TODAY)    // trip is close: due in a few days, not in the past
assert.equal(todo.dueDate, '2026-10-19'); assert.match(todo.notes, /Search with the links/)
assert.equal(bookingTodo('ground', { travelers: 1, rooms: 1, to: 'Lisbon' }, undefined, TODAY).title, 'Book ground transport: Lisbon (1 person)')

// ── reading the web search's answer (never trusted: checked, ordered, capped) ──
assert.deepEqual(readEstimate('{"low":550,"typical":750,"high":1100,"notes":"Fares listed for mid-November."}', 'flight'), { low: 550, typical: 750, high: 1100, notes: 'Fares listed for mid-November.' })
assert.deepEqual(readEstimate('Here you go:\n```json\n{"low": 199.6, "typical": 240.2, "high": 310, "notes": " Based on 3 listings. "}\n```', 'hotel'), { low: 200, typical: 240, high: 310, notes: 'Based on 3 listings.' })
assert.deepEqual(readEstimate('{"low":900,"typical":400,"high":600,"notes":"x"}', 'ground'), { low: 400, typical: 600, high: 900, notes: 'x' })       // out of order: put in order
assert.throws(() => readEstimate('no estimate here', 'flight'))
assert.throws(() => readEstimate('{"low":"cheap","typical":1,"high":2,"notes":"x"}', 'flight'))
assert.throws(() => readEstimate('{"low":1,"typical":2,"high":99999,"notes":"x"}', 'flight'))        // above the most a flight can plausibly be
assert.throws(() => readEstimate('{"low":0,"typical":100,"high":200,"notes":"x"}', 'hotel'))        // zero is not an estimate
assert.throws(() => readEstimate('{"low":1,"typical":3000,"high":3200,"notes":"x"}', 'hotel'))      // a hotel night above $2,500 is a misread
assert.equal(readEstimate('{"low":1,"typical":2,"high":3,"notes":"' + 'y'.repeat(500) + '"}', 'flight').notes.length, 240)

const result = (urls: [string, string][]) => ({ type: 'web_search_tool_result', tool_use_id: 't', content: urls.map(([title, url]) => ({ type: 'web_search_result', title, url, page_age: null, encrypted_content: '' })) }) as never
assert.deepEqual(sourcesFrom([result([['A', 'https://a.example/x'], ['A again', 'https://a.example/x'], ['Plain', 'http://insecure.example/y'], ['Bad', 'not a url'], ['B', 'https://b.example/z']])]), [
  { title: 'A', url: 'https://a.example/x' }, { title: 'B', url: 'https://b.example/z' },
])                                                                                                      // https only, one per page, bad links dropped
assert.equal(sourcesFrom([result(Array.from({ length: 9 }, (_, i) => [`T${i}`, `https://s${i}.example/p`] as [string, string]))]).length, 4)   // at most four
assert.deepEqual(sourcesFrom([{ type: 'web_search_tool_result', tool_use_id: 't', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } } as never]), [])   // a failed search has no sources

console.log('budget-assumptions: all checks passed')
