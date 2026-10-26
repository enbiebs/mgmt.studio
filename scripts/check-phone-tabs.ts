// Checks the phone's bottom bar split.  Run with:  npx tsx scripts/check-phone-tabs.ts
import assert from 'node:assert/strict'
import { BAR_SLOTS, phoneTabs } from '../src/lib/phone-tabs'
import { ROSTER_PAGES } from '../src/lib/nav-map'

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }
const pages = (...keys: string[]) => keys.map(key => ({ key }))
const keys = (xs: { key: string }[]) => xs.map(x => x.key)

check('a few pages all fit on the bar, in their usual order, with no "More"', () => {
  const t = phoneTabs(pages('today', 'calendar', 'tour', 'songs', 'finance'))
  assert.deepEqual(keys(t.bar), ['today', 'calendar', 'tour', 'songs', 'finance']); assert.deepEqual(t.more, []); assert.equal(t.moreActive, false)
  assert.equal(phoneTabs(pages()).bar.length, 0)
})
check('the real All-artists pages (and the manager\'s Company link): four on the bar, the rest under More', () => {
  const t = phoneTabs(pages(...ROSTER_PAGES, 'company'))
  assert.deepEqual(keys(t.bar), ['today', 'calendar', 'tour', 'music']); assert.deepEqual(keys(t.more), ['finance', 'legal', 'company'])
})
check('Music is on the bar even when it is listed after Finance and Legal (it is not just that it happens to come fourth)', () => {
  const t = phoneTabs(pages('today', 'calendar', 'tour', 'finance', 'legal', 'music'))
  assert.deepEqual(keys(t.bar), ['today', 'calendar', 'tour', 'music'])
})
check('inside an artist, Overview and Profile do not take bar places from Today, Calendar, Tour and Music', () => {
  const t = phoneTabs(pages('overview', 'profile', 'today', 'calendar', 'tour', 'songs', 'finance', 'legal', 'content', 'team'))
  assert.deepEqual(keys(t.bar), ['today', 'calendar', 'tour', 'songs'])
  assert.deepEqual(keys(t.more), ['overview', 'profile', 'finance', 'legal', 'content', 'team'], 'More keeps the usual order')
})
check('when someone cannot open Tour, the next most useful pages fill the bar', () => {
  const t = phoneTabs(pages('overview', 'today', 'calendar', 'songs', 'finance', 'legal'))
  assert.deepEqual(keys(t.bar), ['today', 'calendar', 'songs', 'overview'])
  assert.deepEqual(keys(t.more), ['finance', 'legal'])
})
check('More looks selected when the open page is one of its pages, and only then', () => {
  const all = pages('overview', 'today', 'calendar', 'tour', 'songs', 'finance')
  assert.equal(phoneTabs(all, 'finance').moreActive, true)
  assert.equal(phoneTabs(all, 'today').moreActive, false)
  assert.equal(phoneTabs(all, undefined).moreActive, false)
  assert.equal(phoneTabs(pages('today', 'calendar'), 'today').moreActive, false)
})
check('every page is somewhere exactly once, and the bar never has more than the slots allow', () => {
  const all = pages('a', 'b', 'c', 'd', 'e', 'f', 'g', 'today')
  const t = phoneTabs(all)
  assert.equal(t.bar.length + t.more.length, all.length); assert.ok(t.bar.length + 1 <= BAR_SLOTS)
  assert.deepEqual([...keys(t.bar), ...keys(t.more)].sort(), keys(all).sort())
})
console.log(`${n} checks passed`)
