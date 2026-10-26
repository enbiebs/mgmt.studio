// Checks the contract reminders emailed to outside people: which date, when, to whom, and that nothing private goes in them.
// Run with:  npx tsx scripts/check-contract-reminders.ts
import assert from 'node:assert/strict'
import { keyDateFor, milestoneFor, parseAddresses, remindersDue, MAX_REMINDER_ADDRESSES, REMINDER_SUBJECT } from '../src/lib/contract-reminders'
import type { Client, Contract } from '../src/types'

const TODAY = '2026-10-26'
let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }

const contract = (o: Partial<Contract> = {}): Contract => ({ id: 'k1', title: 'Publishing deal', type: 'publishing', status: 'signed', counterparty: 'Kobalt', currency: 'USD', createdAt: '2026-01-01', ...o } as Contract)
const client = (contracts: Contract[], o: Partial<Client> = {}): Client => ({ id: 'a1', name: 'Mascolo', legal: { contracts }, ...o } as unknown as Client)
const STOP = (a: string) => `https://www.mgmtpath.com/api/email/unsubscribe?a=${a}&t=abc`
const due = (c: Contract, today = TODAY, cl: Partial<Client> = {}) => remindersDue([client([c], cl)], today, 'Noted Management', STOP)
const LAWYER = ['lawyer@firm.com']

check('addresses typed in a box are cleaned: lower case, no repeats, bad ones named', () => {
  const r = parseAddresses('Lawyer@Firm.com, assistant@x.org;\nlawyer@firm.com  nonsense, a@b')
  assert.deepEqual(r.emails, ['lawyer@firm.com', 'assistant@x.org'])
  assert.deepEqual(r.bad, ['nonsense', 'a@b'])
  assert.deepEqual(parseAddresses('   '), { emails: [], bad: [] })
})
check('"Name <address>" as pasted from a mail program works', () => {
  assert.deepEqual(parseAddresses('Jane Doe <Jane@Firm.com>, "Pat, Assistant" <pa@x.org>; sam@y.com'), { emails: ['jane@firm.com', 'pa@x.org', 'sam@y.com'], bad: [] })
})
check('an address with tricks in it is not an address', () => {
  for (const bad of ['a@b.com?bcc=x@y.com', 'a@b.com&cc=x', 'a@b.com#x', 'a@[1.2.3.4]', 'a@b..com', '.a@b.com', 'a..b@b.com', 'a@-b.com', 'a@b.c', 'a%40b@c.com', 'a"b@c.com', 'a(b)@c.com']) assert.deepEqual(parseAddresses(bad).emails, [], bad)
})

check('the milestones: 90, 30 and 7 days, nothing further out or in the past', () => {
  assert.equal(milestoneFor(91), null); assert.equal(milestoneFor(90), 90); assert.equal(milestoneFor(31), 90)
  assert.equal(milestoneFor(30), 30); assert.equal(milestoneFor(8), 30)
  assert.equal(milestoneFor(7), 7); assert.equal(milestoneFor(0), 7)
  assert.equal(milestoneFor(-1), null)
})

check('the date that matters is the notice date when there is one', () => {
  const k = keyDateFor(contract({ expiryDate: '2027-01-05', noticeDays: 60, autoRenews: true }), TODAY)!
  assert.deepEqual(k, { date: '2026-11-06', daysLeft: 11, kind: 'notice' })
})
check('with no notice period it is the renewal, or the end for a fixed term', () => {
  assert.deepEqual(keyDateFor(contract({ expiryDate: '2026-12-01', autoRenews: true }), TODAY), { date: '2026-12-01', daysLeft: 36, kind: 'renewal' })
  assert.deepEqual(keyDateFor(contract({ expiryDate: '2026-12-01' }), TODAY), { date: '2026-12-01', daysLeft: 36, kind: 'end' })
})
check('an automatically renewing contract keeps rolling forward instead of going quiet', () => {
  assert.equal(keyDateFor(contract({ expiryDate: '2024-12-01', autoRenews: true, noticeDays: 30 }), TODAY)!.date, '2026-11-01')
})
check('passed dates, unsigned contracts and contracts with no date give nothing', () => {
  assert.equal(keyDateFor(contract({ expiryDate: '2026-10-01' }), TODAY), null)
  assert.equal(keyDateFor(contract({ expiryDate: '2026-12-01', noticeDays: 90 }), TODAY), null)            // its notice date (Sep 2) has passed
  assert.equal(keyDateFor(contract({ status: 'draft', expiryDate: '2026-12-01' }), TODAY), null)
  assert.equal(keyDateFor(contract({}), TODAY), null)
})

check('a reminder goes to each named address when a milestone is reached', () => {
  const r = due(contract({ expiryDate: '2026-12-01', reminderEmails: ['lawyer@firm.com', 'pa@x.org'] }))
  assert.deepEqual(r.map(x => x.to), ['lawyer@firm.com', 'pa@x.org'])
  assert.equal(r[0].key, 'contract:k1:2026-12-01:90:lawyer@firm.com')
})
check('nobody named means nothing is sent', () => {
  assert.equal(due(contract({ expiryDate: '2026-12-01' })).length, 0)
  assert.equal(due(contract({ expiryDate: '2026-12-01', reminderEmails: [] })).length, 0)
})
check('nothing is sent while the date is further than 90 days away', () => {
  assert.equal(due(contract({ expiryDate: '2027-03-01', reminderEmails: LAWYER })).length, 0)
})
check('the same milestone has the same key every day, a new milestone a new key, a changed date a new key', () => {
  const c = contract({ expiryDate: '2026-12-31', reminderEmails: LAWYER })
  const day1 = due(c, '2026-10-26')[0].key, day2 = due(c, '2026-10-27')[0].key
  assert.equal(day1, day2)                                                // 66 and 65 days: still the 90-day reminder, so recorded once
  assert.notEqual(day1, due(c, '2026-12-05')[0].key)                      // 26 days: the 30-day reminder
  assert.notEqual(day1, due({ ...c, expiryDate: '2027-01-15' }, '2026-10-26')[0].key)
})
check('a missed day is made up for: the 30-day reminder is still sent at 29, 20 or 8 days', () => {
  for (const today of ['2026-11-01', '2026-11-10', '2026-11-22']) {
    const r = due(contract({ expiryDate: '2026-12-01', reminderEmails: LAWYER }), today)
    assert.equal(r.length, 1, today); assert.match(r[0].key, /:30:/)
  }
})
check('on the last days it is the 7-day reminder, and on the day itself too', () => {
  assert.match(due(contract({ expiryDate: '2026-11-02', reminderEmails: LAWYER }))[0].key, /:7:/)
  assert.match(due(contract({ expiryDate: '2026-10-26', reminderEmails: LAWYER }))[0].key, /:7:/)
  assert.equal(due(contract({ expiryDate: '2026-10-25', reminderEmails: LAWYER })).length, 0)
})
check('repeats and bad addresses in the saved list are dropped, and there is a cap', () => {
  const many = Array.from({ length: 9 }, (_, i) => `p${i}@x.org`)
  const r = due(contract({ expiryDate: '2026-12-01', reminderEmails: ['A@x.org', 'a@x.org', 'not-an-address', ...many] }))
  assert.equal(r.length, MAX_REMINDER_ADDRESSES)
  assert.equal(new Set(r.map(x => x.to)).size, r.length)
  assert.ok(r.every(x => x.to.includes('@') && x.to === x.to.toLowerCase()))
})
check('practice artists send nothing', () => {
  assert.equal(due(contract({ expiryDate: '2026-12-01', reminderEmails: LAWYER }), TODAY, { isDemo: true }).length, 0)
})
check('the email says what and when, and why they got it, and how to stop it', () => {
  const r = due(contract({ expiryDate: '2027-01-05', noticeDays: 60, autoRenews: true, reminderEmails: LAWYER }))[0]
  assert.equal(r.subject, REMINDER_SUBJECT)
  assert.match(r.text, /Publishing deal \(Mascolo, with Kobalt\)/)
  assert.match(r.text, /last day to give notice is Nov 6, 2026/); assert.match(r.text, /in 11 days/)
  assert.match(r.text, /Noted Management added your address/)
  assert.equal(r.unsubscribeUrl, STOP('lawyer@firm.com'))
  assert.ok(r.text.includes(`Stop these emails: ${STOP('lawyer@firm.com')}`)); assert.ok(r.html.includes('Stop these emails'))
})
check('a company with no name does not read like "your company"', () => {
  const r = remindersDue([client([contract({ expiryDate: '2026-12-01', reminderEmails: LAWYER })])], TODAY, '', STOP)[0]
  assert.match(r.text, /because a Mgmt Path customer added your address/)
})
check('nothing private goes in the email: no fees, terms, notes or files', () => {
  const secret = 'SECRET-FEE-12345'
  const r = due(contract({ expiryDate: '2026-12-01', reminderEmails: LAWYER, value: 987654, notes: secret, terms: { commission: secret }, files: [{ id: 'f', path: 'x/' + secret + '.pdf', name: secret + '.pdf', label: secret, addedAt: '2026-01-01' }] }))[0]
  for (const part of [r.subject, r.text, r.html]) { assert.ok(!part.includes(secret)); assert.ok(!part.includes('987654')); assert.ok(!part.includes('987,654')) }
})
check('what the contract says cannot break the page, and never reaches the subject line', () => {
  const r = due(contract({ title: 'Deal <script>alert(1)</script>\r\nBcc: x@y.com', counterparty: 'A & B <b>', expiryDate: '2026-12-01', reminderEmails: LAWYER }))[0]
  assert.ok(!r.html.includes('<script>')); assert.ok(!r.html.includes('<b>')); assert.ok(r.html.includes('A &amp; B'))
  assert.equal(r.subject, REMINDER_SUBJECT, 'the subject is always the same plain line')
})
check('somebody else\'s words are cleaned before they go to a stranger: no links, one line, cut short', () => {
  const lure = 'URGENT: verify your account at https://evil.example/login or www.evil.example now'
  const r = remindersDue([client([contract({ title: lure + ' ' + 'x'.repeat(500), counterparty: 'Visit http://phish.example', expiryDate: '2026-12-01', reminderEmails: LAWYER })], { name: 'Click www.bad.example <now>' })], TODAY, 'Bank Of Example https://x.example/pay', STOP)[0]
  for (const part of [r.text, r.html]) {
    assert.ok(!part.includes('evil.example')); assert.ok(!part.includes('phish.example')); assert.ok(!part.includes('bad.example')); assert.ok(!part.includes('x.example/pay'))
  }
  assert.ok(r.text.includes('[link removed]'))
  assert.ok(r.text.split('\n')[0].length < 260, 'a long title is cut')
})

console.log(`${n} checks passed`)
