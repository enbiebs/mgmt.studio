// Checks the Sharing list for one artist.  Run with:  npx tsx scripts/check-sharing.ts
import assert from 'node:assert/strict'
import { addablePeople, buildSharingRows, describeRow, levelLabel, pointPeopleCount, type SharingGrant } from '../src/lib/sharing'
import type { WorkspacePerson } from '../src/types'

const person = (id: string, label: string, role: WorkspacePerson['role'], allClients = false): WorkspacePerson =>
  ({ memberId: id, userId: 'u-' + id, label, role, allClients, clientIds: [] })
const grant = (id: string, memberId: string, section: string, clientId: string | null, canEdit = false): SharingGrant => ({ id, memberId, section, clientId, canEdit })

const people = [
  person('m1', 'Eli', 'manager', true), person('sam', 'Sam', 'team'), person('dana', 'Dana', 'team'), person('jo', 'Jo', 'team'),
  person('lee', 'Lee', 'agent', true), person('ann', 'Ann', 'lawyer'), person('art', 'The Artist', 'artist'),
]
const grants = [
  grant('1', 'sam', 'admin', 'a', true),
  grant('2', 'dana', 'finance', 'a', true), grant('3', 'dana', 'tour', 'a', true), grant('4', 'dana', 'team', 'a', false),
  grant('5', 'jo', 'tour', 'a', false), grant('6', 'jo', 'tour', 'b', true),
  grant('7', 'ann', 'legal', 'b', true),                                              // only another artist
]
const rows = buildSharingRows(people, grants, 'a')

// who is listed, and in what order: Point People, then roles, then company-wide, then managers
assert.deepEqual(rows.map(r => `${r.kind}:${r.person.label}`), ['person:Sam', 'person:Dana', 'person:Jo', 'company:Lee', 'manager:Eli'])
assert.ok(!rows.some(r => r.person.label === 'The Artist'))                          // the artist's own login is never in the list
assert.ok(!rows.some(r => r.person.label === 'Ann'))                                 // someone who only has ANOTHER artist is not listed here

// each row says what it is
const byName = (n: string) => rows.find(r => r.person.label === n)!
const keyOf = (n: string) => { const r = byName(n); return r.kind === 'person' ? r.levelKey : r.kind }
assert.equal(keyOf('Sam'), 'admin')
assert.equal(keyOf('Dana'), 'tourmanager')   // finance edit + tour edit + team view is the tour/production manager level
assert.equal(keyOf('Jo'), 'crew')               // tour view only
assert.equal(levelLabel('admin'), 'Point Person')
assert.equal(levelLabel('crew'), 'Touring Crew')
assert.equal(levelLabel('custom'), 'Custom pages')
assert.equal(levelLabel('none'), 'No pages yet')
assert.equal(pointPeopleCount(rows), 1)
assert.equal(pointPeopleCount(buildSharingRows(people, [], 'a')), 0)

// plain-language description
const sam = byName('Sam'); const jo = byName('Jo')
if (sam.kind !== 'person' || jo.kind !== 'person') throw new Error('expected person rows')
assert.ok(describeRow(sam, 'a').startsWith('Everything'))
assert.equal(describeRow(jo, 'a'), 'Can look at: Tour')                              // Jo's Tour edit on artist b is not shown for artist a

// who can still be added: teammates who are not already listed, never managers or artists
assert.deepEqual(addablePeople(people, rows).map(p => p.label), ['Ann'])
assert.deepEqual(addablePeople(people, []).map(p => p.label), ['Ann', 'Dana', 'Jo', 'Lee', 'Sam'])

// someone with a company-wide grant AND rows for this artist is an editable row that says so
const both = buildSharingRows([person('lee', 'Lee', 'agent', true)], [grant('9', 'lee', 'tour', 'a')], 'a')
assert.equal(both[0].kind, 'person')
assert.ok(both[0].kind === 'person' && both[0].alsoCompanyWide)

// a vault-only grant is a row (so it can be seen) but no page level
const vaultOnly = buildSharingRows([person('v', 'Vee', 'team')], [grant('v1', 'v', 'vault', 'a')], 'a')
assert.equal(vaultOnly[0].kind === 'person' && vaultOnly[0].levelKey, 'none')

console.log('sharing: all checks passed')
