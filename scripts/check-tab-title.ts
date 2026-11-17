// Checks the number in the browser tab's title.  Run with:  npx tsx scripts/check-tab-title.ts
import assert from 'node:assert/strict'
import { withCount, stripCount, setTabCount, setBaseTitle, wantedTitle, resetTabTitle } from '../src/lib/tab-title'

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }

check('nothing to do means no number', () => assert.equal(withCount('Today · Artist Path', 0), 'Today · Artist Path'))
check('a number goes in front', () => assert.equal(withCount('Today · Artist Path', 3), '(3) Today · Artist Path'))
check('a big number is capped', () => { assert.equal(withCount('Today', 99), '(99) Today'); assert.equal(withCount('Today', 100), '(99+) Today') })
check('strip takes the number off, and only a leading one', () => {
  assert.equal(stripCount('(3) Today · Artist Path'), 'Today · Artist Path')
  assert.equal(stripCount('(99+) Today'), 'Today')
  assert.equal(stripCount('Today (3) later'), 'Today (3) later')
  assert.equal(stripCount('Today'), 'Today')
})
check('setting a number replaces the old one instead of stacking', () => {
  resetTabTitle()
  const doc = { title: 'Legal · Mascolo · Artist Path' }
  setTabCount(doc, 2); assert.equal(doc.title, '(2) Legal · Mascolo · Artist Path')
  setTabCount(doc, 5); assert.equal(doc.title, '(5) Legal · Mascolo · Artist Path')
  setTabCount(doc, 0); assert.equal(doc.title, 'Legal · Mascolo · Artist Path')
})
check('a bad number counts as nothing', () => {
  const doc = { title: 'Today' }
  setTabCount(doc, -4); assert.equal(doc.title, 'Today')
  setTabCount(doc, NaN); assert.equal(doc.title, 'Today')
})
check('the page title and the number are kept apart, so either can change first', () => {
  resetTabTitle()
  const doc = { title: 'Artist Path' }
  assert.equal(wantedTitle(), null, 'nothing to restore before the page has a title')
  setTabCount(doc, 4); assert.equal(doc.title, '(4) Artist Path')
  setBaseTitle(doc, 'Calendar · Mascolo · Artist Path'); assert.equal(doc.title, '(4) Calendar · Mascolo · Artist Path')
  assert.equal(wantedTitle(), '(4) Calendar · Mascolo · Artist Path')
  setBaseTitle(doc, 'Today · Artist Path'); setTabCount(doc, 0); assert.equal(doc.title, 'Today · Artist Path'); assert.equal(wantedTitle(), 'Today · Artist Path')
  doc.title = 'Artist Path'                                   // Next puts its plain title back...
  assert.notEqual(doc.title, wantedTitle())                  // ...and wantedTitle is what the page restores
  resetTabTitle()
})
check('a name typed with two spaces cannot trap the tab in a loop (a browser reads the title back with the spaces squeezed)', () => {
  resetTabTitle()
  const doc = { title: 'x' }
  setBaseTitle(doc, 'Today · Nova  Lane · Artist Path'); setTabCount(doc, 2)
  assert.equal(doc.title, '(2) Today · Nova Lane · Artist Path')
  assert.equal(wantedTitle(), '(2) Today · Nova Lane · Artist Path')
  // what the browser gives back for document.title is exactly what we want, so the page's watcher finds nothing to fix
  assert.equal(doc.title.replace(/\s+/g, ' ').trim(), wantedTitle())
  resetTabTitle()
})
console.log(`${n} checks passed`)
