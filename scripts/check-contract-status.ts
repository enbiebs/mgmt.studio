// Checks what state a contract is really in today (the date wins over the stored status).  Run with:  npx tsx scripts/check-contract-status.ts
import assert from 'node:assert/strict'
import { EXPIRING_DAYS, contractAlerts, daysToExpiry, effectiveStatus, expiryLine } from '../src/lib/contract-status'
import { getCalendarEvents } from '../src/lib/calendar'
import type { Client, Contract } from '../src/types'

const TODAY = '2026-10-19'
const contract = (o: Partial<Contract> = {}): Contract => ({ id: 'c1', title: 'Pub deal', type: 'publishing', status: 'signed', counterparty: 'Kobalt', currency: 'USD', ...o } as Contract)

// ── days to the end ──
assert.equal(EXPIRING_DAYS, 90)
assert.equal(daysToExpiry(contract({ expiryDate: '2026-10-19' }), TODAY), 0)
assert.equal(daysToExpiry(contract({ expiryDate: '2026-10-01' }), TODAY), -18)
assert.equal(daysToExpiry(contract(), TODAY), null)

// ── a signed contract past its end date is Expired, never plain Signed ──
assert.equal(effectiveStatus(contract({ expiryDate: '2026-10-01' }), TODAY), 'expired')
assert.equal(effectiveStatus(contract({ expiryDate: '2026-10-18' }), TODAY), 'expired')       // yesterday
assert.equal(effectiveStatus(contract({ expiryDate: '2026-10-19' }), TODAY), 'expiring')      // today: still in force, ending today (was in neither list before)
assert.equal(effectiveStatus(contract({ expiryDate: '2027-01-17' }), TODAY), 'expiring')      // exactly 90 days
assert.equal(effectiveStatus(contract({ expiryDate: '2027-01-18' }), TODAY), 'signed')        // 91 days
assert.equal(effectiveStatus(contract(), TODAY), 'signed')                                    // no end date: nothing to expire
// …only a signed one expires
for (const status of ['draft', 'review', 'negotiation'] as const) assert.equal(effectiveStatus(contract({ status, expiryDate: '2026-01-01' }), TODAY), status)
assert.equal(effectiveStatus(contract({ status: 'terminated', expiryDate: '2026-01-01' }), TODAY), 'terminated')
assert.equal(effectiveStatus(contract({ status: 'expired' }), TODAY), 'expired')              // someone already marked it

// ── the structured date, in words ──
assert.equal(expiryLine(contract({ expiryDate: '2026-10-01' }), TODAY), 'Expired Oct 1, 2026 (18 days ago)')
assert.equal(expiryLine(contract({ expiryDate: '2026-10-18' }), TODAY), 'Expired Oct 18, 2026 (1 day ago)')
assert.equal(expiryLine(contract({ expiryDate: '2026-10-19' }), TODAY), 'Expires today, Oct 19, 2026')
assert.equal(expiryLine(contract({ expiryDate: '2026-10-20' }), TODAY), 'Expires Oct 20, 2026 (in 1 day)')
assert.equal(expiryLine(contract({ expiryDate: '2026-12-01' }), TODAY), 'Expires Dec 1, 2026 (in 43 days)')
assert.equal(expiryLine(contract(), TODAY), null)
// a note that says something different changes nothing
assert.equal(effectiveStatus(contract({ expiryDate: '2026-10-01', notes: 'Expiring Aug 2026' }), TODAY), 'expired')

// ── alerts: each contract counted once ──
const list = [
  contract({ id: 'a', expiryDate: '2026-10-01' }),                              // expired
  contract({ id: 'b', expiryDate: '2026-11-15', flagged: true }),               // expiring AND flagged
  contract({ id: 'c', expiryDate: '2026-12-31' }),                              // expiring
  contract({ id: 'd', expiryDate: '2028-01-01' }),                              // fine
  contract({ id: 'e', status: 'draft', expiryDate: '2026-01-01' }),             // a draft is not an alert
  contract({ id: 'f', status: 'terminated', expiryDate: '2026-01-01' }),
  contract({ id: 'g', flagged: true }),                                         // flagged only
]
const alerts = contractAlerts(list, TODAY)
assert.deepEqual(alerts.expired.map(c => c.id), ['a'])
assert.deepEqual(alerts.expiring.map(c => c.id), ['b', 'c'])                    // soonest first
assert.deepEqual(alerts.flagged.map(c => c.id), ['b', 'g'])
assert.equal(alerts.count, 4)                                                   // a, b (once), c, g
assert.equal(contractAlerts([], TODAY).count, 0)

// ── the calendar: drafts never "expire", an ended contract reads "expired" ──
const client = { tour: { shows: [] }, songs: { albums: [] }, content: { posts: [] }, finance: { invoices: [], expenses: [] }, projects: [], agentData: { offers: [] }, legal: { contracts: list } } as unknown as Client
const events = getCalendarEvents(client, () => true, TODAY).filter(e => e.domain === 'contract')
assert.deepEqual(events.map(e => e.id).sort(), ['contract-a', 'contract-b', 'contract-c', 'contract-d'])
assert.equal(events.find(e => e.id === 'contract-a')?.title, 'Pub deal expired')
assert.equal(events.find(e => e.id === 'contract-a')?.state, 'overdue')
assert.equal(events.find(e => e.id === 'contract-c')?.title, 'Pub deal expires')

// ── a contract that renews by itself never expires: its end rolls forward and the notice date is what needs watching ──
const renewing = contract({ id: 'r', expiryDate: '2026-01-01', autoRenews: true, noticeDays: 60 })     // renews Jan 1, 2027 (notice by Nov 2)
assert.equal(effectiveStatus(renewing, TODAY), 'signed', 'not expired, not "expiring": it renews')
assert.equal(effectiveStatus(contract({ expiryDate: '2026-11-01', autoRenews: true }), TODAY), 'signed', 'not even in its last 90 days')
assert.equal(daysToExpiry(renewing, TODAY), 74, 'days to the next renewal')
assert.equal(expiryLine(renewing, TODAY), 'Renews Jan 1, 2027 (in 74 days)')
assert.equal(expiryLine(contract({ expiryDate: TODAY, autoRenews: true }), TODAY), 'Renews today, Oct 19, 2026')
assert.equal(expiryLine(contract({ status: 'draft', expiryDate: '2026-01-01', autoRenews: true }), TODAY), 'Expired Jan 1, 2026 (291 days ago)', 'a draft does not renew')

// ── the notice date is an alert of its own, counted once ──
const noticeList = [
  contract({ id: 'n1', expiryDate: '2026-12-31', noticeDays: 60 }),                                  // fixed term, notice by Nov 1 (13 days)
  contract({ id: 'n2', expiryDate: '2026-12-10', autoRenews: true, noticeDays: 60 }),                // renews, notice date passed 8 days ago
  contract({ id: 'n3', expiryDate: '2026-12-31', noticeDays: 60, flagged: true }),                   // notice AND flagged: one contract
  contract({ id: 'n4', expiryDate: '2027-06-01', noticeDays: 60 }),                                  // far off
  contract({ id: 'n5', expiryDate: '2026-12-01', noticeDays: 60 }),                                  // fixed term, notice date passed: no notice alert (it is simply ending)
  contract({ id: 'n6', expiryDate: '2026-11-15', autoRenews: true }),                                // renews, no notice period written down: the renewal itself is watched
]
const na = contractAlerts(noticeList, TODAY)
assert.deepEqual(na.notice.map(c => c.id), ['n2', 'n1', 'n3', 'n6'], 'earliest date first (the passed notice date leads; the renewal with no notice period goes by its renewal date)')
assert.deepEqual(na.flagged.map(c => c.id), ['n3'])
assert.equal(na.count, 5, 'n1, n2, n3 (once, though it is on two lists), n5 (ending within 90 days, no notice to give any more) and n6')
assert.equal(contractAlerts([contract({ id: 'x', expiryDate: '2026-12-31' })], TODAY).notice.length, 0, 'no notice period, no notice alert')

// ── the calendar: a renewal is a renewal, and the notice date gets its own day ──
const rClient = { tour: { shows: [] }, songs: { albums: [] }, content: { posts: [] }, finance: { invoices: [], expenses: [] }, projects: [], agentData: { offers: [] }, legal: { contracts: [renewing, contract({ id: 'f', expiryDate: '2026-12-31', noticeDays: 60 }), contract({ id: 'g', expiryDate: '2026-12-01', noticeDays: 60 })] } } as unknown as Client
const rEvents = getCalendarEvents(rClient, () => true, TODAY).filter(e => e.domain === 'contract')
assert.equal(rEvents.find(e => e.id === 'contract-r')?.title, 'Pub deal renews')
assert.equal(rEvents.find(e => e.id === 'contract-r')?.date, '2027-01-01', 'on its next renewal, not the first end date')
assert.equal(rEvents.find(e => e.id === 'contract-notice-r')?.date, '2026-11-02', 'the notice date has its own entry')
assert.equal(rEvents.find(e => e.id === 'contract-notice-r')?.title, 'Notice date: Pub deal')
assert.equal(rEvents.find(e => e.id === 'contract-notice-f')?.date, '2026-11-01')
assert.equal(rEvents.some(e => e.id === 'contract-notice-g'), false, 'a notice date already behind us is not put on the calendar')
assert.equal(rEvents.find(e => e.id === 'contract-f')?.title, 'Pub deal expires')

console.log('contract-status checks passed')
