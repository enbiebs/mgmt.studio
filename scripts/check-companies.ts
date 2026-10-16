// Checks how the app handles one login in several companies.  Run with:  npx tsx scripts/check-companies.ts
import assert from 'node:assert/strict'
import { clientsOfCompany, contextFields, groupRosterByCompany, openableClientIds, pickHomeWorkspace, type CompanyContext } from '../src/lib/companies'

const ctx = (workspaceId: string, role: CompanyContext['role'], extra: Partial<CompanyContext> = {}): CompanyContext => ({
  workspaceId, companyName: workspaceId.toUpperCase(), ownerUserId: null, role, memberId: 'm-' + workspaceId, authClientId: null,
  grants: [], workspacePeople: [], legalTemplates: [], ...extra,
})

// which company the app opens on
assert.equal(pickHomeWorkspace([ctx('a', 'team'), ctx('b', 'manager')], 'me'), 'b')                                    // one they manage beats one they only work in
assert.equal(pickHomeWorkspace([ctx('a', 'manager'), ctx('b', 'manager', { ownerUserId: 'me' })], 'me'), 'b')           // one they own beats one they manage
assert.equal(pickHomeWorkspace([ctx('a', 'artist'), ctx('b', 'team')], 'me'), 'b')                                     // an artist login is not a home
assert.equal(pickHomeWorkspace([ctx('a', 'artist')], 'me'), 'a')                                                        // unless it is all they have
assert.equal(pickHomeWorkspace([ctx('a', 'team'), ctx('b', 'agent')], null), 'a')
assert.equal(pickHomeWorkspace([], 'me'), null)

// what a person can open in one company
const clients = ['c1', 'c2', 'c3']
assert.deepEqual(openableClientIds(ctx('a', 'manager'), clients), clients)
assert.deepEqual(openableClientIds(ctx('a', 'artist', { authClientId: 'c2' }), clients), ['c2'])
assert.deepEqual(openableClientIds(ctx('a', 'artist'), clients), [])
assert.deepEqual(openableClientIds(ctx('a', 'team', { grants: [{ section: 'tour', clientId: 'c3', canEdit: false }, { section: 'music', clientId: 'c3', canEdit: true }] }), clients), ['c3'])
assert.deepEqual(openableClientIds(ctx('a', 'team', { grants: [{ section: 'tour', clientId: null, canEdit: false }] }), clients), clients)   // a company-wide page opens everyone
assert.deepEqual(openableClientIds(ctx('a', 'team', { grants: [{ section: 'tour', clientId: 'zzz', canEdit: false }] }), clients), [])        // a page for an artist that is not here opens nothing
assert.deepEqual(openableClientIds(ctx('a', 'team'), clients, ['c1']), ['c1'])                                          // a single shared item puts the artist on the roster
assert.deepEqual(openableClientIds(ctx('a', 'team'), clients), [])

// the roster grouped by company: the home company first, empty companies left out
const roster = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }]
const cw = { c1: 'a', c2: 'b', c3: 'b', c4: 'z' }
const groups = groupRosterByCompany(roster, cw, { a: 'Alpha', b: 'Beta' }, ['b', 'a', 'empty'])
assert.deepEqual(groups.map(g => g.workspaceId), ['b', 'a', 'z'])                                                      // 'empty' has nobody; 'z' is not in the order so it comes last
assert.deepEqual(groups.map(g => g.companyName), ['Beta', 'Alpha', ''])
assert.deepEqual(groups[0].clients.map(c => c.id), ['c2', 'c3'])
assert.deepEqual(groupRosterByCompany([], {}, {}, ['a']), [])

// switching company is one assignment of these fields
const f = contextFields(ctx('b', 'team', { ownerUserId: 'owner', authClientId: null }))
assert.equal(f.workspaceId, 'b'); assert.equal(f.role, 'team'); assert.equal(f.authRole, 'team'); assert.equal(f.myMemberId, 'm-b'); assert.equal(f.companyOwnerId, 'owner')


// one company's artists: an artist with no recorded company belongs to the open one
assert.deepEqual(clientsOfCompany([{ id: 'x' }, { id: 'y' }, { id: 'z' }], { x: 'a', y: 'b' }, 'a').map(c => c.id), ['x', 'z'])
assert.deepEqual(clientsOfCompany([{ id: 'x' }, { id: 'y' }], { x: 'a', y: 'b' }, 'b').map(c => c.id), ['y'])
assert.deepEqual(clientsOfCompany([{ id: 'x' }], {}, null).map(c => c.id), ['x'])

console.log('companies: all checks passed')
