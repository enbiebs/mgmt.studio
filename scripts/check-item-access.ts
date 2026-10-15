// Checks that the app's own access rules agree with the database for a Point Person.  Run with:  npx tsx scripts/check-item-access.ts
import assert from 'node:assert/strict'
import { SECTION_TO_GRANT_KEY, effectiveSees, hasSectionGrant, type ItemException, type Viewer } from '../src/lib/item-access'
import type { MainSection } from '../src/types'

const viewer = (grants: Viewer['grants'], role: Viewer['role'] = 'team'): Viewer => ({ memberId: 'm1', role, clientId: null, grants })
const sections = Object.keys(SECTION_TO_GRANT_KEY) as MainSection[]

// a Point Person for artist a covers EVERY section of a, and nothing of b
const pp = viewer([{ section: 'admin', clientId: 'a', canEdit: true }])
for (const s of sections) {
  assert.ok(hasSectionGrant(pp, s, 'a'), `a Point Person should reach ${s} on their artist`)
  assert.ok(!hasSectionGrant(pp, s, 'b'), `a Point Person must not reach ${s} on another artist`)
}

// ordinary grants are unchanged: one section, one artist; a company-wide grant covers every artist
const tour = viewer([{ section: 'tour', clientId: 'a', canEdit: false }])
assert.ok(hasSectionGrant(tour, 'tour', 'a')); assert.ok(!hasSectionGrant(tour, 'finance', 'a')); assert.ok(!hasSectionGrant(tour, 'tour', 'b'))
const everywhere = viewer([{ section: 'finance', clientId: null, canEdit: true }])
assert.ok(hasSectionGrant(everywhere, 'finance', 'a')); assert.ok(hasSectionGrant(everywhere, 'finance', 'zzz')); assert.ok(!hasSectionGrant(everywhere, 'tour', 'a'))

// managers and artist logins are unchanged
assert.ok(hasSectionGrant(viewer([], 'manager'), 'finance', 'a'))
assert.ok(hasSectionGrant({ ...viewer([], 'artist'), clientId: 'a' }, 'tour', 'a'))
assert.ok(!hasSectionGrant({ ...viewer([], 'artist'), clientId: 'a' }, 'tour', 'b'))

// a manager's per-item "hide" still hides from a Point Person (the database checks it first, too), and "share" still works
const hide: ItemException[] = [{ id: 'x1', clientId: 'a', itemType: 'invoice', itemId: 'i1', memberId: 'm1', effect: 'hide' }]
assert.ok(effectiveSees(pp, 'invoice', 'i1', 'a', []))
assert.ok(!effectiveSees(pp, 'invoice', 'i1', 'a', hide))
assert.ok(effectiveSees(pp, 'invoice', 'i2', 'a', hide))                                   // only that one item
const share: ItemException[] = [{ id: 'x2', clientId: 'a', itemType: 'invoice', itemId: 'i1', memberId: 'm1', effect: 'share' }]
assert.ok(!effectiveSees(tour, 'invoice', 'i1', 'a', []))
assert.ok(effectiveSees(tour, 'invoice', 'i1', 'a', share))

console.log('item-access: all checks passed')
