// Checks the titles on the Team page.  Run with:  npx tsx scripts/check-team-roles.ts
import assert from 'node:assert/strict'
import { KEY_ROLES, MAX_TITLE_CHARS, TITLE_SUGGESTIONS, cleanTitle, holdersOf, missingKeyRoles, titleCovers } from '../src/lib/team-roles'
import type { Person } from '../src/types'

const p = (id: string, name: string, title?: string): Person => ({ id, name, title })

// a free-text title covers a role by whole words, ignoring case and punctuation
assert.ok(titleCovers('Tour Manager', 'Tour manager'))
assert.ok(titleCovers('tour   manager', 'Tour manager'))
assert.ok(titleCovers('Tour Manager / Stylist', 'Tour manager'))
assert.ok(titleCovers('Label manager', 'Label'))
assert.ok(titleCovers('Business Manager (Noted)', 'Business manager'))
assert.ok(!titleCovers('Production manager', 'Tour manager'))
assert.ok(!titleCovers('Labelling intern', 'Label'))              // whole words only
assert.ok(!titleCovers('Lawyers', 'Lawyer'))
assert.ok(!titleCovers(undefined, 'Agent')); assert.ok(!titleCovers('', 'Agent'))

// who holds a role, and the roles nobody holds
const team = [p('1', 'Dana', 'Tour Manager'), p('2', 'Ben', 'Agent / Booking'), p('3', 'Riley'), p('4', 'Sam', 'Stylist')]
assert.deepEqual(holdersOf(team, 'Tour manager').map(x => x.name), ['Dana'])
assert.deepEqual(holdersOf(team, 'Agent').map(x => x.name), ['Ben'])
assert.deepEqual(missingKeyRoles(team), ['Business manager', 'Lawyer', 'Label', 'Publicist'])
assert.deepEqual(missingKeyRoles([]), [...KEY_ROLES])
// a crew role counts too, so nothing has to be typed twice
const crewRole = (person: Person) => person.id === '3' ? ['Lawyer'] : []
assert.deepEqual(holdersOf(team, 'Lawyer', crewRole).map(x => x.name), ['Riley'])
assert.deepEqual(missingKeyRoles(team, crewRole), ['Business manager', 'Label', 'Publicist'])
// two people can hold the same role
assert.equal(holdersOf([p('a', 'A', 'Agent'), p('b', 'B', 'Junior agent')], 'Agent').length, 2)

// the title box: trimmed, tidy, limited, and empty means none
assert.equal(cleanTitle('  Tour   Manager '), 'Tour Manager')
assert.equal(cleanTitle(''), undefined); assert.equal(cleanTitle('   '), undefined); assert.equal(cleanTitle(undefined), undefined)
assert.equal(cleanTitle('x'.repeat(200))!.length, MAX_TITLE_CHARS)
// suggestions are unique and start with the key roles
assert.equal(new Set(TITLE_SUGGESTIONS).size, TITLE_SUGGESTIONS.length)
assert.deepEqual(TITLE_SUGGESTIONS.slice(0, KEY_ROLES.length), [...KEY_ROLES])

console.log('team-roles: all checks passed')
