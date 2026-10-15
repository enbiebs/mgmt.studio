// Checks the Company page's grid.  Run with:  npx tsx scripts/check-company.ts
import assert from 'node:assert/strict'
import { buildCompanyGrid, hasNothing, isPointPerson } from '../src/lib/company'
import type { SharingGrant } from '../src/lib/sharing'
import type { WorkspacePerson } from '../src/types'

const person = (id: string, label: string, role: WorkspacePerson['role'], extra: Partial<WorkspacePerson> = {}): WorkspacePerson =>
  ({ memberId: id, userId: 'u-' + id, label, role, allClients: role === 'manager', clientIds: [], ...extra })
const grant = (id: string, memberId: string, section: string, clientId: string | null, canEdit = false): SharingGrant => ({ id, memberId, section, clientId, canEdit })

const people = [
  person('m1', 'Eli', 'manager'), person('zed', 'Zed', 'team'), person('ann', 'Ann', 'team'), person('bo', 'Bo', 'agent'),
  person('lee', 'Lee', 'team', { allClients: true }), person('art', 'The Artist', 'artist'), person('new', 'Newt', 'team', { invited: true }),
]
const grants: Record<string, SharingGrant[]> = {
  a: [grant('1', 'ann', 'admin', 'a', true), grant('2', 'zed', 'tour', 'a', false), grant('3', 'bo', 'tour', 'a', true), grant('3b', 'bo', 'deals', 'a', true)],
  b: [grant('4', 'zed', 'finance', 'b', true), grant('5', 'zed', 'tour', 'b', false)],       // not a ready-made role
  c: [],
}
const grid = buildCompanyGrid(people, grants, ['a', 'b', 'c'])

// managers are admins; artists are not in the grid; everyone else is, A to Z
assert.deepEqual(grid.admins.map(p => p.label), ['Eli'])
assert.deepEqual(grid.rows.map(r => r.person.label), ['Ann', 'Bo', 'Lee', 'Newt', 'Zed'])

// each cell says what the person has for that artist
const row = (name: string) => grid.rows.find(r => r.person.label === name)!
assert.equal(row('Ann').cells.a.levelKey, 'admin'); assert.ok(isPointPerson(row('Ann').cells.a))
assert.equal(row('Ann').cells.b.levelKey, 'none'); assert.equal(row('Ann').cells.b.grants.length, 0)
assert.equal(row('Zed').cells.a.levelKey, 'crew')                         // tour look-only is the touring crew level
assert.equal(row('Zed').cells.b.levelKey, 'custom')                       // finance + tour view is not one of the roles
assert.equal(row('Bo').cells.a.levelKey, 'custom')                        // tour + deals (no team/projects) is not the agent level
assert.equal(row('Zed').artistCount, 2)
assert.equal(row('Ann').artistCount, 1)

// another artist's rows never leak into a cell
assert.equal(row('Zed').cells.c.levelKey, 'none')
assert.ok(row('Zed').cells.a.grants.every(g => g.client_id === 'a'))

// company-wide access is flagged, and someone with nothing at all is easy to find
assert.equal(row('Lee').companyWide, true); assert.equal(row('Zed').companyWide, false)
assert.ok(!hasNothing(row('Lee')))                                        // company-wide counts as something
assert.ok(hasNothing(row('Newt')))                                        // invited, no artist yet
assert.ok(!hasNothing(row('Ann')))

// no artists, or no people: empty, never an error
assert.deepEqual(buildCompanyGrid([], {}, []).rows, [])
assert.equal(buildCompanyGrid(people, {}, []).rows.length, 5)

console.log('company: all checks passed')
