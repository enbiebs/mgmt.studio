// Checks the "one email per artist" rule for people: who counts as the same person, what happens when someone is added or an
// email is edited to one that is taken, and that the same email on another artist stays fine.  Run with:  npx tsx scripts/check-people-dedupe.ts
import assert from 'node:assert/strict'
import { addOrReuse, applyPersonPatch, duplicateGroups, emailKey, emailTakenMessage, findSameEmail, saveFailureMessage } from '../src/lib/people-dedupe'
import type { Person } from '../src/types'

const marco: Person = { id: 'p1', name: 'Marco Rossi', email: 'Marco@Tour.example', title: 'Tour Manager' }
const sam: Person = { id: 'p2', name: 'Sam Ortiz', email: 'sam@tour.example' }
const dana: Person = { id: 'p3', name: 'Dana Reyes' }                       // no email
const jo: Person = { id: 'p4', name: 'Jo Weller', email: '' }               // blank email
const list = [marco, sam, dana, jo]

// ── who counts as the same person ──
assert.equal(emailKey('  Marco@Tour.EXAMPLE '), 'marco@tour.example')
assert.equal(emailKey(undefined), ''); assert.equal(emailKey(null), ''); assert.equal(emailKey('   '), '')
assert.equal(findSameEmail(list, 'marco@tour.example')?.id, 'p1', 'capitals do not make a different person')
assert.equal(findSameEmail(list, '  MARCO@tour.example  ')?.id, 'p1', 'neither do stray spaces')
assert.equal(findSameEmail(list, 'someone.else@tour.example'), undefined)
assert.equal(findSameEmail(list, 'marco@tour.example', 'p1'), undefined, 'a person is not a duplicate of themselves')
assert.equal(findSameEmail(list, 'marco@tour.example', 'p2')?.id, 'p1', 'but is of someone else')
assert.equal(findSameEmail(list, undefined), undefined, 'no email is never a match')
assert.equal(findSameEmail(list, ''), undefined, 'a blank email is never a match, even with a blank one in the list')
assert.equal(findSameEmail(list, '   '), undefined)
assert.equal(findSameEmail([], 'a@b.co'), undefined)

// ── finding duplicates in an existing list ──
assert.deepEqual(duplicateGroups(list), [], 'a clean list has none, and people without an email are not duplicates of each other')
const messy = [marco, { id: 'p9', name: 'Marco R.', email: ' marco@tour.example ' }, sam, { id: 'p8', name: 'Sam O', email: 'SAM@tour.example' }, { id: 'p7', name: 'Sam O again', email: 'sam@tour.example' }, dana, jo]
assert.deepEqual(duplicateGroups(messy).map(g => g.map(p => p.id)), [['p1', 'p9'], ['p2', 'p8', 'p7']], 'groups come out in list order')

// ── adding someone ──
let n = 0
const makeId = () => `new-${++n}`
const fresh = addOrReuse(list, { name: 'Priya Shah', email: 'priya@label.example' }, makeId)
assert.equal(fresh.reused, undefined); assert.equal(fresh.id, 'new-1'); assert.equal(fresh.people.length, 5)
assert.deepEqual(fresh.people.at(-1), { name: 'Priya Shah', email: 'priya@label.example', id: 'new-1' })
assert.equal(list.length, 4, 'the original list is not changed')
const again = addOrReuse(list, { name: 'Marco (second copy)', email: 'MARCO@tour.example' }, makeId)
assert.equal(again.reused?.id, 'p1'); assert.equal(again.id, 'p1', 'the existing person is used'); assert.equal(again.people, list, 'and nothing new is made')
assert.equal(n, 1, 'no new id is spent on a reused person')
const noMail = addOrReuse(list, { name: 'Another No-Email' }, makeId)
assert.equal(noMail.reused, undefined); assert.equal(noMail.people.length, 5, 'two people without emails can both exist')
const blank = addOrReuse(list, { name: 'Blank', email: '' }, makeId)
assert.equal(blank.reused, undefined, 'a blank email does not match the blank one already there')

// ── the same email on a different artist is fine ──
const otherArtist: Person[] = [{ id: 'q1', name: 'Marco Rossi', email: 'marco@tour.example' }]
assert.equal(addOrReuse(otherArtist, { name: 'Sam Ortiz', email: 'sam@tour.example' }, makeId).reused, undefined)
assert.equal(findSameEmail(otherArtist, 'sam@tour.example'), undefined, 'each artist is checked on its own list')

// ── editing ──
const rename = applyPersonPatch(list, 'p2', { name: 'Samuel Ortiz', phone: '+1 555-0100' })
assert.equal(rename.blockedBy, undefined); assert.equal(rename.person?.name, 'Samuel Ortiz'); assert.equal(rename.person?.email, 'sam@tour.example')
const sameOwn = applyPersonPatch(list, 'p2', { email: 'SAM@tour.example' })
assert.equal(sameOwn.blockedBy, undefined, 'keeping your own email (in other capitals) is not a clash'); assert.equal(sameOwn.person?.email, 'SAM@tour.example')
const clash = applyPersonPatch(list, 'p2', { name: 'Sam, new name', email: ' marco@tour.example ', phone: '123' })
assert.equal(clash.blockedBy?.id, 'p1', 'taking Marco\'s email is refused')
assert.equal(clash.person?.email, 'sam@tour.example', 'the email stays as it was')
assert.equal(clash.person?.name, 'Sam, new name'); assert.equal(clash.person?.phone, '123', 'but every other change is kept')
assert.equal(clash.people.find(p => p.id === 'p1')?.email, 'Marco@Tour.example', 'and Marco is untouched')
const clear = applyPersonPatch(list, 'p2', { email: undefined })
assert.equal(clear.blockedBy, undefined); assert.equal(clear.person?.email, undefined, 'clearing an email is allowed')
const fill = applyPersonPatch(list, 'p3', { email: 'dana@promo.example' })
assert.equal(fill.person?.email, 'dana@promo.example', 'giving someone a free email works')
assert.equal(applyPersonPatch(list, 'p3', { email: '' }).blockedBy, undefined, 'a blank email never clashes')
const nobody = applyPersonPatch(list, 'nope', { name: 'x' })
assert.equal(nobody.person, undefined); assert.equal(nobody.people, list, 'an unknown id changes nothing')
const log = applyPersonPatch(list, 'p1', { activity: [{ id: 'a1', date: '2026-10-19', text: 'Sent the advance' }] })
assert.equal(log.person?.activity?.length, 1); assert.equal(log.person?.email, 'Marco@Tour.example', 'a patch without an email leaves it alone')

// ── old data: two people already share an email. Saving a card WITHOUT changing the email must never be refused or blamed on the other person ──
const old = [{ id: 'a', name: 'A', email: 'x@y.co', phone: '1' }, { id: 'b', name: 'B', email: 'X@Y.co' }]
const keep = applyPersonPatch(old, 'a', { name: 'A', email: 'x@y.co', phone: '2' })              // what the card sends: the email is always in the patch
assert.equal(keep.blockedBy, undefined, 'an unchanged email is not blocked'); assert.equal(keep.person?.phone, '2', 'and the other change is saved')
assert.equal(applyPersonPatch(old, 'a', { email: ' X@y.CO ' }).blockedBy, undefined, 'the same email in other capitals is still unchanged')
assert.equal(applyPersonPatch(old, 'a', { email: 'someone.new@y.co' }).blockedBy, undefined, 'moving off the shared email is allowed')
assert.equal(applyPersonPatch(list, 'p2', { email: 'marco@tour.example' }).blockedBy?.id, 'p1', 'but a real change onto a taken email is still refused')
const taken = applyPersonPatch(list, 'p2', { email: 'marco@tour.example', name: 'Renamed' })
assert.equal('email' in (taken.person ?? {}) && taken.person?.email, 'sam@tour.example'); assert.equal(taken.person?.name, 'Renamed')

// ── what to tell someone when the database refuses to save ──
assert.equal(saveFailureMessage({ name: 'Marco', email: ' m@x.co ' }, '23505'), 'Marco could not be saved: another person on this artist already has the email m@x.co. Refresh to see the latest list.')
assert.equal(saveFailureMessage({ name: 'Marco' }, '42501'), "Marco could not be saved: you don't have permission to add or change people here.")
assert.equal(saveFailureMessage({ name: 'Marco' }, '08006'), 'Marco could not be saved. Please try again.')
assert.equal(saveFailureMessage({ name: 'Marco' }), 'Marco could not be saved. Please try again.')

// ── the message names the right person and the email ──
assert.equal(emailTakenMessage('Marco Rossi', ' marco@tour.example '), "Marco Rossi already has the email marco@tour.example on this artist's team.")

console.log('people-dedupe checks passed')
