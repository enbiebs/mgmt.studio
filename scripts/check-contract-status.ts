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

console.log('contract-status checks passed')
