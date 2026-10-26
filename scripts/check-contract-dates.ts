// Checks the dates that matter in a contract: renewals that roll forward by themselves, and the notice date.
// Run with:  npx tsx scripts/check-contract-dates.ts
import assert from 'node:assert/strict'
import { DEFAULT_RENEWAL_MONTHS, NOTICE_PASSED_DAYS, NOTICE_WARN_DAYS, addMonths, currentTermEnd, dateToAct, noticeInfo, noticeLine, noticeNeedsAction, renewalWatch, renewalsSoFar } from '../src/lib/contract-dates'
import type { Contract } from '../src/types'

const TODAY = '2026-10-19'
const c = (o: Partial<Contract> = {}): Contract => ({ id: 'c1', title: 'Mgmt deal', type: 'touring', status: 'signed', counterparty: 'Agency', createdAt: '2025-01-01', ...o } as Contract)

// ── adding months keeps the day of the month, or the last day of a shorter month ──
assert.equal(addMonths('2026-01-31', 1), '2026-02-28')
assert.equal(addMonths('2028-01-31', 1), '2028-02-29', 'a leap year')
assert.equal(addMonths('2026-03-15', 12), '2027-03-15')
assert.equal(addMonths('2026-11-30', 3), '2027-02-28')
assert.equal(addMonths('2026-12-15', 1), '2027-01-15', 'over the new year')
assert.equal(addMonths('2026-10-19', 0), '2026-10-19')
assert.equal(addMonths('2026-10-19', -12), '2025-10-19')
assert.equal(addMonths('2026-02-28', 12), '2027-02-28')

// ── the end of the term in force ──
assert.equal(DEFAULT_RENEWAL_MONTHS, 12)
assert.equal(currentTermEnd(c(), TODAY), null, 'no end date')
assert.equal(currentTermEnd(c({ expiryDate: '2026-12-01' }), TODAY), '2026-12-01', 'a fixed term ends when it says')
assert.equal(currentTermEnd(c({ expiryDate: '2026-01-01' }), TODAY), '2026-01-01', 'a fixed term that has ended stays ended')
assert.equal(currentTermEnd(c({ expiryDate: '2026-01-01', autoRenews: true }), TODAY), '2027-01-01', 'renewing: rolls forward by a year')
assert.equal(currentTermEnd(c({ expiryDate: '2024-03-15', autoRenews: true }), TODAY), '2027-03-15', 'rolls forward as many times as it takes')
assert.equal(currentTermEnd(c({ expiryDate: '2026-12-01', autoRenews: true }), TODAY), '2026-12-01', 'not yet at its first end')
assert.equal(currentTermEnd(c({ expiryDate: TODAY, autoRenews: true }), TODAY), TODAY, 'ending today is still this term')
assert.equal(currentTermEnd(c({ expiryDate: '2026-04-30', autoRenews: true, renewalMonths: 6 }), TODAY), '2026-10-30', 'a six-month renewal')
assert.equal(currentTermEnd(c({ expiryDate: '2025-01-31', autoRenews: true, renewalMonths: 1 }), TODAY), '2026-10-31', 'month ends do not drift (Jan 31 renews on the last day each month)')
assert.equal(currentTermEnd(c({ expiryDate: '2026-01-01', autoRenews: true, renewalMonths: 0 }), TODAY), '2027-01-01', 'a renewal length of 0 means the default')
assert.equal(currentTermEnd(c({ status: 'draft', expiryDate: '2026-01-01', autoRenews: true }), TODAY), '2026-01-01', 'only a signed contract renews')
assert.equal(currentTermEnd(c({ status: 'terminated', expiryDate: '2026-01-01', autoRenews: true }), TODAY), '2026-01-01')
assert.equal(renewalsSoFar(c({ expiryDate: '2024-03-15', autoRenews: true }), TODAY), 3)
assert.equal(renewalsSoFar(c({ expiryDate: '2026-12-01', autoRenews: true }), TODAY), 0)
assert.equal(renewalsSoFar(c({ expiryDate: '2024-03-15' }), TODAY), 0, 'a fixed term does not renew')

// ── the notice date ──
assert.equal(noticeInfo(c({ expiryDate: '2026-12-01' }), TODAY), null, 'no notice period given')
assert.equal(noticeInfo(c({ noticeDays: 60 }), TODAY), null, 'no end date to count back from')
assert.equal(noticeInfo(c({ status: 'draft', expiryDate: '2026-12-01', noticeDays: 60 }), TODAY), null, 'only signed contracts have one')
assert.deepEqual(noticeInfo(c({ expiryDate: '2026-12-01', noticeDays: 60 }), TODAY), { deadline: '2026-10-02', daysLeft: -17, passed: true, termEnd: '2026-12-01', autoRenews: false })
assert.deepEqual(noticeInfo(c({ expiryDate: '2026-12-31', noticeDays: 60 }), TODAY), { deadline: '2026-11-01', daysLeft: 13, passed: false, termEnd: '2026-12-31', autoRenews: false })
assert.equal(noticeInfo(c({ expiryDate: '2026-12-01', noticeDays: 0 }), TODAY)?.deadline, '2026-12-01', 'zero days of notice: the end date itself')
const renewing = c({ expiryDate: '2026-01-01', autoRenews: true, noticeDays: 60 })
assert.deepEqual(noticeInfo(renewing, TODAY), { deadline: '2026-11-02', daysLeft: 14, passed: false, termEnd: '2027-01-01', autoRenews: true }, 'the notice date counts back from the renewal that is coming')

// ── when the notice date needs attention ──
assert.equal(NOTICE_WARN_DAYS, 30)
const needs = (o: Partial<Contract>) => noticeNeedsAction(c({ noticeDays: 60, ...o }), TODAY)
assert.equal(needs({ expiryDate: '2026-12-31' }), true, '13 days left')
assert.equal(needs({ expiryDate: '2027-01-17' }), true, 'exactly 30 days left')   // deadline 2026-11-18
assert.equal(needs({ expiryDate: '2027-01-18' }), false, '31 days left')
assert.equal(needs({ expiryDate: '2026-12-31', autoRenews: true }), true)
assert.equal(needs({ expiryDate: '2026-12-01' }), false, 'a fixed term whose notice date has passed: nothing left to do')
assert.equal(NOTICE_PASSED_DAYS, 14)
assert.equal(needs({ expiryDate: '2026-12-10', autoRenews: true }), true, 'a renewing one whose notice date passed 8 days ago: it WILL renew, so that is worth knowing')
assert.equal(needs({ expiryDate: '2026-12-04', autoRenews: true }), true, 'passed 14 days ago: the last day it is said')   // deadline 2026-10-05
assert.equal(needs({ expiryDate: '2026-12-03', autoRenews: true }), false, 'passed 15 days ago: it is just a fact now')
assert.equal(needs({ expiryDate: '2026-12-01', autoRenews: true }), false, 'passed 17 days ago')
assert.equal(needs({ expiryDate: '2026-12-10' }), false, 'a fixed term whose notice date passed 8 days ago: nothing to do, however recently')
// a short term with a notice period that fills most of it: the date is "just passed" for most of every term, so it is not said
assert.equal(noticeNeedsAction(c({ expiryDate: '2026-01-01', autoRenews: true, renewalMonths: 1, noticeDays: 20 }), '2026-11-14'), false, 'one-month terms, 20 days notice: 30 is not more than 20 + 14')
assert.equal(noticeNeedsAction(c({ expiryDate: '2026-01-01', autoRenews: true, renewalMonths: 2, noticeDays: 20 }), '2026-12-15'), true, 'two-month terms, 20 days notice: 60 is more than 34, so a date that passed 3 days ago is said')   // the term ends Jan 1 2027; notice by Dec 12
// month to month with 30 days notice: the notice date is always "just passed", so it is never said (it would never stop)
assert.equal(noticeNeedsAction(c({ expiryDate: '2026-01-01', autoRenews: true, renewalMonths: 1, noticeDays: 30 }), '2026-11-02'), false, 'passed alert never fires when notice is as long as the term')
assert.equal(noticeNeedsAction(c({ expiryDate: '2026-01-01', autoRenews: true, renewalMonths: 1, noticeDays: 30 }), '2026-11-15'), false)
assert.equal(noticeNeedsAction(c({ expiryDate: '2026-01-01', autoRenews: true, renewalMonths: 3, noticeDays: 30 }), '2026-12-05'), true, 'three-month terms with 30 days notice: a real window, so a notice date that has just passed is still said')
assert.equal(needs({ expiryDate: '2026-10-01' }), false, 'ended')
assert.equal(needs({ expiryDate: '2026-10-01', autoRenews: true }), false, 'it renewed: the next notice date is a year away')   // rolls to 2027-10-01 -> deadline 2027-08-02
assert.equal(needs({ expiryDate: '2026-12-31', status: 'draft' }), false)

// ── in words ──
const line = (o: Partial<Contract>) => noticeLine(c({ noticeDays: 60, ...o }), TODAY)
assert.equal(line({ expiryDate: '2026-12-31' }), 'Give notice by Nov 1, 2026 (in 13 days)')
assert.equal(line({ expiryDate: '2026-12-18' }), 'Give notice today, Oct 19, 2026', 'the notice date is today')
assert.equal(line({ expiryDate: '2026-12-02' }), 'Notice was due Oct 3, 2026', 'a fixed term that missed it')
assert.equal(line({ expiryDate: '2026-12-01', autoRenews: true }), 'The notice date (Oct 2, 2026) has passed. It renews Dec 1, 2026.', 'the sentence is still there on the contract after the alert has gone quiet')
assert.equal(line({ expiryDate: '2026-12-31', noticeDays: undefined }), null)
assert.equal(line({ expiryDate: '2026-10-20', noticeDays: 0 }), 'Give notice by Oct 20, 2026 (in 1 day)', 'singular')

// ── a contract that renews by itself with no notice period written down ──
const quiet = (o: Partial<Contract>) => c({ autoRenews: true, ...o })
assert.deepEqual(renewalWatch(quiet({ expiryDate: '2026-11-15' }), TODAY), { termEnd: '2026-11-15', daysLeft: 27 })
assert.deepEqual(renewalWatch(quiet({ expiryDate: '2026-11-18' }), TODAY), { termEnd: '2026-11-18', daysLeft: 30 }, 'a month before: yes')
assert.equal(renewalWatch(quiet({ expiryDate: '2026-11-19' }), TODAY), null, '31 days: not yet')
assert.equal(renewalWatch(quiet({ expiryDate: '2026-11-15', noticeDays: 60 }), TODAY), null, 'with a notice period the notice date is what is watched')
assert.deepEqual(renewalWatch(quiet({ expiryDate: '2026-11-15', noticeDays: undefined }), TODAY)?.daysLeft, 27)
assert.equal(renewalWatch(c({ expiryDate: '2026-11-15' }), TODAY), null, 'a contract that does not renew has nothing to watch here')
assert.equal(renewalWatch(quiet({ expiryDate: '2026-11-15', status: 'draft' }), TODAY), null)
assert.equal(renewalWatch(quiet({}), TODAY), null, 'no end date')
assert.equal(noticeLine(quiet({ expiryDate: '2026-11-15' }), TODAY), 'Renews Nov 15, 2026 (in 27 days). Add its notice period to be warned earlier.')
assert.equal(noticeLine(quiet({ expiryDate: TODAY }), TODAY), 'Renews today, Oct 19, 2026. Add its notice period to be warned earlier.')

// ── the one date to act on ──
assert.deepEqual(dateToAct(c({ expiryDate: '2026-12-31', noticeDays: 60 }), TODAY), { date: '2026-11-01', daysLeft: 13, passed: false, renewalOnly: false })
assert.deepEqual(dateToAct(quiet({ expiryDate: '2026-11-15' }), TODAY), { date: '2026-11-15', daysLeft: 27, passed: false, renewalOnly: true }, 'no notice period: the renewal itself')
assert.deepEqual(dateToAct(quiet({ expiryDate: '2026-12-10', noticeDays: 60 }), TODAY), { date: '2026-10-11', daysLeft: -8, passed: true, renewalOnly: false })
assert.equal(dateToAct(c({ expiryDate: '2028-01-01', noticeDays: 60 }), TODAY), null)
assert.equal(dateToAct(c({ expiryDate: '2026-12-01', noticeDays: 60 }), TODAY), null, 'fixed term, notice passed: nothing to do')

console.log('contract-dates checks passed')
