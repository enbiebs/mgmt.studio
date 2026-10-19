// Checks that the demo artist tells ONE story: every screen agrees with every other, on any day it is seeded.
// Runs the demo rows through the app's own row reader and logic (progress, alerts, forecast, settlements, contracts, P&L, search).  Run with:  npx tsx scripts/check-demo-seed.ts
import assert from 'node:assert/strict'
import { assembleWorkspace } from '../src/lib/db'
import { DEMO_CLIENT_ID, buildDemoRows, type DemoContext } from '../src/lib/demo-seed'
import { INSERT_ORDER, TABLES, demoSql, toWorkspaceRows, validateRows } from '../src/lib/demo-sql'
import { STEPS, progressForShow } from '../src/lib/show-progress'
import { buildInbox } from '../src/lib/inbox'
import { buildForecast } from '../src/lib/forecast'
import { buildPL, totalExpenses, totalRevenue } from '../src/lib/ledger'
import { balanceOf, checkSettlement, paidSoFar } from '../src/lib/settlement-math'
import { contractAlerts, effectiveStatus } from '../src/lib/contract-status'
import { actualCostsForShow, settledPnl, settlementEarned } from '../src/lib/budget'
import { invoiceTotal } from '../src/lib/money'
import { buildRecordEntries } from '../src/lib/search-records'
import { searchCommands } from '../src/lib/command-search'
import { daysUntil } from '../src/lib/date-state'
import type { Client } from '../src/types'

const OWNER = 'f7303cf1-f728-46a2-a861-dc7787c00d9c'
const ctxFor = (anchor: string): DemoContext => ({ anchor, clientId: DEMO_CLIENT_ID, workspaceId: '873c4c0d-be6a-4ce3-9013-4755a5596299', ownerUserId: OWNER })
const ACCESS = { finance: true, tour: true, deals: true, legal: true, projects: true }
const LIVE_RATES = { EUR: 1.08, GBP: 1.27 }

function load(anchor: string) {
  const ctx = ctxFor(anchor)
  const rows = buildDemoRows(ctx)
  const client = assembleWorkspace(toWorkspaceRows(ctx, rows)).clients[0] as Client
  return { ctx, rows, client }
}
const byVenue = (c: Client, text: string) => c.tour.shows.find(s => s.venue.includes(text))!
const ruleSet = (c: Client, anchor: string) => buildInbox(c, anchor, ACCESS)

function checkStory(anchor: string) {
  const { rows, client: c } = load(anchor)
  const T = (n: number) => { const d = new Date(anchor + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
  const say = (what: string) => `${what} (seeded on ${anchor})`

  // ── the rows fit the database ──
  assert.deepEqual(validateRows(rows), [], say('rows match the tables'))
  for (const t of INSERT_ORDER) assert.ok(rows[t] !== undefined, `${t} is written`)
  assert.equal(c.id, DEMO_CLIENT_ID); assert.equal(c.isDemo, true)

  // ── one booking = one offer + one show, linked both ways, saying the same thing ──
  assert.equal(c.tour.shows.length, 4)
  const offers = c.agentData!.offers
  for (const show of c.tour.shows) {
    const offer = offers.find(o => o.id === show.tourOfferId)
    assert.ok(offer, say(`${show.venue} has its offer`))
    assert.equal(offer!.showId, show.id, say(`${show.venue}: the offer points back at the show`))
    assert.equal(offer!.date, show.date); assert.equal(offer!.venue, show.venue); assert.equal(show.city.startsWith(offer!.city), true)
    assert.equal(show.guarantee, offer!.guarantee, say(`${show.venue}: the fee is the same on the offer and the show`))
  }
  for (const word of ['Brooklyn Mirage', 'Fabric', 'Tresor', 'Printworks']) {
    assert.equal(c.tour.shows.filter(s => s.venue.includes(word)).length, 1, say(`one ${word} show`))
    assert.equal(offers.filter(o => o.venue.includes(word)).length, 1, say(`one ${word} offer`))   // no duplicate or leftover copy
  }
  assert.deepEqual(offers.filter(o => !o.showId).map(o => o.status).sort(), ['cancelled', 'hold', 'inquiry'])   // only open or dead offers have no show
  assert.equal(new Set(c.tour.shows.map(s => s.date)).size, 4, say('no two shows on one day'))
  assert.equal(new Set(offers.map(o => `${o.venue}|${o.date}`)).size, offers.length)
  assert.ok(c.tour.shows.every(s => s.status === 'confirmed'))
  const past = c.tour.shows.filter(s => s.date < anchor), ahead = c.tour.shows.filter(s => s.date >= anchor)
  assert.deepEqual([past.length, ahead.length], [2, 2], say('two played, two to come'))

  // ── travel: the day before, the same hotel and rooms on both screens, no airport that closed ──
  assert.ok(!JSON.stringify(rows).includes('TXL'))
  for (const show of c.tour.shows) {
    const trips = c.tour.travel.filter(t => t.showIds?.includes(show.id))
    const adv = c.tour.advances.find(a => a.showId === show.id)!
    const hotel = trips.find(t => t.kind === 'hotel') as Extract<typeof trips[number], { kind: 'hotel' }>
    assert.ok(hotel, say(`${show.venue} has a hotel`))
    assert.equal(hotel.name, adv.hospitality.hotel, say(`${show.venue}: same hotel on Travel and the advance`))
    assert.equal(String(hotel.roomCount), adv.hospitality.roomCount, say(`${show.venue}: same room count on Travel and the advance`))
    const away = !show.city.startsWith('Brooklyn')         // a home-town show has a day-of room; every other show has the room from the day before
    assert.equal(hotel.checkIn, away ? T(daysUntil(show.date, anchor) - 1) : show.date, say(`${show.venue}: the room starts on the right night`))
    assert.ok(hotel.checkOut! > show.date, say(`${show.venue}: checks out after the show`))
    for (const f of trips.filter(t => t.kind === 'flight')) {
      for (const leg of (f as Extract<typeof f, { kind: 'flight' }>).legs) {
        const dep = daysUntil(leg.departure!.slice(0, 10), show.date), arr = daysUntil(leg.arrival!.slice(0, 10), show.date)
        assert.ok(dep >= -2 && dep <= 1 && arr >= -1 && arr <= 1, say(`${show.venue}: a flight is dated within a day or two of the show, not a month away (dep ${dep}, arr ${arr})`))
      }
    }
    for (const f of trips.filter(t => t.kind === 'flight')) {
      for (const leg of (f as Extract<typeof f, { kind: 'flight' }>).legs) assert.ok(adv.logistics.flights?.includes(`${leg.airline} ${leg.flightNumber}`), say(`${show.venue}: the advance names flight ${leg.airline} ${leg.flightNumber}`))
    }
  }
  const into = (id: string) => (c.tour.travel.find(t => t.id === id) as Extract<typeof c.tour.travel[number], { kind: 'flight' }>).legs
  assert.equal(daysUntil(into('dn-tr-f-fabric-out')[0].arrival!.slice(0, 10), byVenue(c, 'Fabric').date), -1, say('the flight lands the day before Fabric'))
  assert.equal(daysUntil(into('dn-tr-f-tresor-in')[0].arrival!.slice(0, 10), byVenue(c, 'Tresor').date), -1, say('the flight lands the day before Tresor'))
  assert.equal(daysUntil(into('dn-tr-f-printworks-out')[0].arrival!.slice(0, 10), byVenue(c, 'Printworks').date), -1)
  // travel is paid once: nothing in the bills repeats a booking
  assert.ok(!c.finance.expenses.some(e => /hotel|flight|airfare/i.test(e.description)))

  // ── where each show stands ──
  const step = (venue: string) => { const p = progressForShow(c, byVenue(c, venue), anchor); return { key: p.current < STEPS.length ? STEPS[p.current].key : 'all-done', p } }
  assert.equal(step('Brooklyn Mirage').key, 'all-done', say('Brooklyn is played, settled and paid'))
  const pw = step('Printworks')
  assert.equal(pw.key, 'paid'); assert.equal(pw.p.next?.label, 'Chase the invoice', say('Printworks is waiting on money, not on an advance'))
  assert.equal(step('Fabric').key, 'showday'); assert.match(step('Fabric').p.waiting ?? '', /Show day is in 8 days/)
  const tre = step('Tresor'); assert.equal(tre.key, 'advance'); assert.equal(tre.p.next?.label, 'Finish the advance')
  for (const s of past) assert.ok(!['advance', 'travel', 'showday', 'confirmed'].includes(step(s.venue).key), say(`${s.venue} is past the advance`))

  // ── the money agrees ──
  const inv = (n: string) => c.finance.invoices.find(i => i.number === n)!
  const settlement = (venue: string) => c.finance.settlements!.find(s => s.venue?.includes(venue))!
  const linked = (invoiceId: string) => c.business.banking.deposits.filter(d => d.invoiceId === invoiceId).reduce((a, d) => a + d.amount, 0)
  const bk = byVenue(c, 'Brooklyn'), prw = byVenue(c, 'Printworks')
  assert.equal(invoiceTotal(inv('INV-1001')), bk.guarantee); assert.equal(settlementEarned(settlement('Brooklyn')), bk.guarantee)
  assert.equal(bk.received, bk.guarantee); assert.equal(linked(inv('INV-1001').id), bk.guarantee, say('Brooklyn: invoice, settlement, fee, received and deposits are one number'))
  assert.equal(balanceOf(settlement('Brooklyn')), 0); assert.equal(inv('INV-1001').status, 'paid')
  assert.equal(invoiceTotal(inv('INV-1002')), prw.guarantee); assert.equal(settlementEarned(settlement('Printworks')), prw.guarantee)
  assert.equal(prw.received, 16000); assert.equal(linked(inv('INV-1002').id), 16000)
  assert.equal(balanceOf(settlement('Printworks')), prw.guarantee! - prw.received!, say('Printworks: what is still owed is the fee less what arrived'))
  assert.equal(paidSoFar(settlement('Printworks')) + (prw.deposit ?? 0), prw.received)
  for (const st of c.finance.settlements!) {
    const failed = checkSettlement(st, st.currency).filter(x => !x.ok)
    assert.deepEqual(failed, [], say(`${st.venue}: every sum on the settlement adds up`))
  }
  // the settled P&L and the budget tell the same story (within a sensible margin on each cost)
  for (const show of past) {
    const budget = c.finance.budgets.find(b => b.showId === show.id)!
    const actual = actualCostsForShow(c, show, 'USD', LIVE_RATES).byBucket
    for (const bucket of ['airfare', 'hotels', 'local_transport', 'sound_lights'] as const) {
      const planned = budget.lines.filter(l => l.bucket === bucket).reduce((a, l) => a + l.amount, 0), real = actual[bucket] ?? 0
      if (planned === 0 && real === 0) continue
      assert.ok(Math.abs(real - planned) <= Math.max(60, planned * 0.12), say(`${show.venue}: ${bucket} budget ${planned} vs real ${Math.round(real)}`))
    }
    const pnl = settledPnl(c, show, budget, LIVE_RATES)!
    assert.ok(pnl.settled.net > 0 && pnl.settled.gross === show.guarantee, say(`${show.venue}: a settled profit on the real income`))
  }

  // ── contracts: the end date is the truth, and no note repeats a date ──
  const contract = (word: string) => c.legal.contracts.find(k => k.title.includes(word))!
  assert.equal(effectiveStatus(contract('Kobalt'), anchor), 'expiring'); assert.equal(daysUntil(contract('Kobalt').expiryDate!, anchor), 25)
  assert.equal(effectiveStatus(contract('WME'), anchor), 'expired')
  const alerts = contractAlerts(c.legal.contracts, anchor)
  assert.deepEqual([alerts.expired.length, alerts.expiring.length], [1, 1])
  for (const k of c.legal.contracts) assert.ok(!/\b(19|20)\d{2}\b|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(k.notes ?? ''), say(`${k.title}: the note does not repeat a date`))

  // ── Home: the problems are findable, in a believable amount ──
  const inbox = ruleSet(c, anchor)
  const by = (rule: string) => inbox.filter(i => i.rule === rule)
  assert.equal(by('invoice').length, 1); assert.equal(by('invoice')[0].severity, 'urgent'); assert.match(by('invoice')[0].title, /INV-1002 .* 5 days overdue/)
  assert.deepEqual(by('bill').map(b => b.severity).sort(), ['soon', 'urgent'])
  assert.equal(by('balance').length, 1); assert.equal(by('balance')[0].amount, 6000)
  assert.equal(by('receivable').length, 1); assert.match(by('receivable')[0].title, /Tresor/)                       // the Tresor deposit is late
  assert.deepEqual(by('contract').map(i => i.severity).sort(), ['soon', 'urgent'])
  assert.equal(by('offer_reply').length, 1); assert.match(by('offer_reply')[0].title, /Berghain/)
  assert.deepEqual(by('project').map(i => i.title).filter(t => /Press kit/.test(t)).length, 1)
  assert.equal(by('deposits').length, 1)
  for (const rule of ['no_settlement', 'empty', 'no_budget']) assert.equal(by(rule).length, 0, say(`nothing wrongly flagged: ${rule}`))
  const needing = inbox.filter(i => i.severity !== 'info').length
  assert.ok(needing >= 7 && needing <= 12, say(`${needing} items need attention: lively, not absurd`))
  assert.ok(inbox.every(i => i.demo === true), say('every demo alert is marked as practice data'))

  // ── cash forecast ──
  const fc = buildForecast(c, anchor)
  assert.equal(fc.filter(f => f.kind === 'installment' && f.late).length, 1, say('one deposit expected and not recorded'))
  assert.ok(fc.some(f => f.kind === 'invoice' && f.date === T(12)), say('the next brand instalment is on the forecast'))

  // ── the P&L comes from these records: through this month, counted once, in the right currencies ──
  const pl = buildPL(c, anchor)
  assert.deepEqual(pl.currencies, ['USD', 'GBP'])
  const month = (m: ReturnType<typeof buildPL>['months'][string]) => m.map(x => x.month)
  assert.equal(month(pl.months.USD).at(-1), anchor.slice(0, 7), say('the P&L runs through this month'))
  const usd = pl.months.USD, gbp = pl.months.GBP
  const recordMonthsUsd = usd.filter(m => m.source === 'records')
  assert.equal(usd.filter(m => m.source === 'typed').length, 6, say('six typed months of history'))
  assert.ok(usd.findIndex(m => m.source === 'records') > usd.map(m => m.source).lastIndexOf('typed'), say('typed history ends before the records begin'))
  assert.equal(recordMonthsUsd.reduce((a, m) => a + totalRevenue(m), 0), 146490, say('revenue is each deposit once (invoices a deposit paid are not counted again)'))
  assert.equal(recordMonthsUsd.reduce((a, m) => a + totalExpenses(m), 0), 17900, say('paid dollar bills only'))
  assert.equal(gbp.filter(m => m.source === 'records').reduce((a, m) => a + totalExpenses(m), 0), 2490, say('paid pound bills, never added into dollars'))
  assert.equal(gbp.reduce((a, m) => a + totalRevenue(m), 0), 0)
  assert.ok(usd.slice(-4).every(m => m.source !== 'none' || m.month >= T(0).slice(0, 7)), say('no quiet gaps in the last months'))

  // ── a person can find things ──
  const found = (q: string) => searchCommands(buildRecordEntries([c], () => true), q).map(e => e.id)
  assert.ok(found('Kobalt').length > 0 && found('Long Time').includes('song-dn-t-long-time') && found('Dana').some(i => i.startsWith('person-')) && found('Hoxton').length > 0)

  // ── the artist's own side ──
  assert.equal(c.projects.filter(p => p.fromArtist && !p.assigneeId).length, 1)
  assert.ok(c.projects.some(p => p.assigneeId === OWNER), say('some work is assigned to the owner'))
  assert.ok(c.artistTodos.length === 3 && c.songs.albums.length === 2)
  const lead = c.songs.albums.flatMap(a => a.tracks).find(t => t.priority === 'lead-single')!
  assert.ok(lead.releaseDate, say('the lead single has a release date'))
  assert.equal(c.songs.albums.find(a => a.title === 'Night Shift EP')!.tracks.reduce((a, t) => a + (t.stage === 'done' ? 1 : 0), 0), 1)
  assert.equal(lead.credits!.reduce((a, cr) => a + cr.split, 0), 100, say('the splits on the lead single add to 100%'))
  const eligible = c.songs.albums.flatMap(a => a.tracks).filter(t => t.touched.endsWith('d') && parseInt(t.touched, 10) >= 10)
  assert.equal(eligible.length, 1, say('one track is stalled, not five'))

  return rows
}

// ── the story holds on any day it is seeded ──
const A = '2026-10-19'
const rowsToday = checkStory(A)
checkStory('2027-01-31')                                    // a month end
checkStory('2028-02-29')                                    // a leap day
checkStory('2026-12-30')                                    // across a year end

// ── every date is counted from the anchor: seeding a week later moves the whole story a week, nothing else changes ──
const normalise = (anchor: string, rows: ReturnType<typeof buildDemoRows>) => {
  const { pl_months: _p, ...rest } = rows
  void _p
  return JSON.stringify(rest).replace(/\d{4}-\d{2}-\d{2}/g, d => `D${daysUntil(d, anchor)}`)
}
assert.equal(normalise('2026-10-26', buildDemoRows(ctxFor('2026-10-26'))), normalise(A, rowsToday), 'a week later is the same story, a week on')
assert.equal(normalise('2026-11-02', buildDemoRows(ctxFor('2026-11-02'))), normalise(A, rowsToday))
assert.deepEqual(buildDemoRows(ctxFor(A)), rowsToday, 'seeding twice gives identical rows (so a re-run only moves dates)')
// the ids are stable and unique inside each table
for (const [table, list] of Object.entries(rowsToday)) {
  const idCol = TABLES[table].columns.includes('id') ? 'id' : null
  if (idCol && list.every(r => r.id !== undefined)) assert.equal(new Set(list.map(r => r.id)).size, list.length, `${table} ids are unique`)
}

// ── the SQL ──
const sql = demoSql(ctxFor(A), rowsToday)
assert.ok(sql.startsWith('do $demo$') && sql.trimEnd().endsWith('$demo$;'))
assert.ok(!sql.includes('raise exception'), 'the real run does not roll itself back')
assert.ok(demoSql(ctxFor(A), rowsToday, { dryRun: true }).includes("raise exception 'DEMO SEED DRY RUN OK (rolled back)'"))
assert.match(sql, /delete from public\.deposits where client_id = 'demo-nova-lane';/)
assert.match(sql, /delete from public\.activity_log where client_id = 'demo-nova-lane';/)
assert.match(sql, /delete from public\.item_access where client_id = 'demo-nova-lane';/)
for (const never of ['access_grants', 'workspace_members', 'pending_invites', 'artist_accounts', 'clients']) assert.ok(!sql.includes(`delete from public.${never}`), `the seed never deletes ${never}`)   // who has access is never touched
assert.ok(sql.indexOf('insert into public.shows') > sql.indexOf('insert into public.tour_offers'), 'offers are written before the shows that point at them')
assert.ok(sql.indexOf("update public.tour_offers set show_id") > sql.indexOf('insert into public.shows'), 'and are pointed at their show afterwards')
assert.ok(sql.indexOf('insert into public.show_deals') > sql.indexOf('insert into public.invoices'), 'invoices exist before the fees that name them')
assert.ok(sql.indexOf('insert into public.deposits') > sql.indexOf('insert into public.invoices'), 'and before the deposits that pay them')
assert.match(sql, /::jsonb/); assert.match(sql, /array\['dn-p-nova', 'dn-p-marco', 'dn-p-sam'\]::text\[\]/)
// quotes in text cannot break out of the SQL
const tricky = buildDemoRows(ctxFor(A)); tricky.vendors[0].name = "O'Brien's; drop table shows; --"
assert.ok(demoSql(ctxFor(A), tricky).includes("'O''Brien''s; drop table shows; --'"))
// rows that do not fit the tables are refused, not written
const bad = buildDemoRows(ctxFor(A)); bad.shows[0].nonsense = 1; delete bad.shows[1].venue
assert.throws(() => demoSql(ctxFor(A), bad), /unknown column "nonsense"[\s\S]*"venue" is required/)

console.log('demo-seed checks passed')
