// Checks the release timeline: due dates from the release date, what is late, and when a release has anything to say.
// Run with:  npx tsx scripts/check-release-plan.ts
import assert from 'node:assert/strict'
import { checklistOf, dueDateFor, LEAD_DAYS, planItems, releaseStatus } from '../src/lib/release-plan'
import { defaultChecklist } from '../src/lib/utils'
import type { Album, ChecklistItemKey } from '../src/types'

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }
const TODAY = '2026-10-26'
const album = (o: Partial<Album> = {}): Album => ({ id: 'al1', title: 'New Single', releaseDate: '2026-11-20', tracks: [{ id: 't1' } as never], ...o })

check('every step of the standard checklist has a lead time, and delivering comes before the release', () => {
  for (const i of defaultChecklist()) assert.ok(Number.isInteger(LEAD_DAYS[i.key]) && LEAD_DAYS[i.key] >= 0, i.key)
  assert.equal(Object.keys(LEAD_DAYS).length, defaultChecklist().length, 'no step without a lead time, none extra')
  assert.ok(LEAD_DAYS.metadata >= 28 && LEAD_DAYS.dsppitch >= 28, 'delivery and the pitch are about four weeks ahead')
})
check('due dates count back from the release date, across month and year ends', () => {
  assert.equal(dueDateFor('artwork', '2026-11-20'), '2026-10-16')
  assert.equal(dueDateFor('copyright', '2026-11-20'), '2026-11-20')
  assert.equal(dueDateFor('splits', '2027-01-10'), '2026-11-15')
  assert.equal(dueDateFor('metadata', '2026-03-01T00:00:00Z'), '2026-02-01', 'a date with a time on it still works')
})
check('with no release date there are no due dates and nothing is late', () => {
  const p = planItems(defaultChecklist(), undefined, TODAY)
  assert.ok(p.every(x => x.due === null && x.daysLeft === null && !x.late))
})
check('a step is late once its day has passed, unless it is done', () => {
  const items = defaultChecklist().map(i => (i.key === 'splits' ? { ...i, done: true } : i))
  const p = Object.fromEntries(planItems(items, '2026-11-20', TODAY).map(x => [x.item.key, x]))
  assert.equal(p.artwork.due, '2026-10-16'); assert.equal(p.artwork.daysLeft, -10); assert.equal(p.artwork.late, true)
  assert.equal(p.splits.late, false, 'done is never late')
  assert.equal(p.officialsound.due, '2026-11-06'); assert.equal(p.officialsound.daysLeft, 11); assert.equal(p.officialsound.late, false)
  assert.equal(planItems(defaultChecklist(), '2026-11-20', '2026-10-16').find(x => x.item.key === 'artwork')!.late, false, 'due today is not late yet')
})
check('a release has something to say only when it is coming up', () => {
  assert.equal(releaseStatus(album({ releaseDate: undefined }), TODAY), null)
  assert.equal(releaseStatus(album({ releaseDate: '2026-10-01' }), TODAY), null, 'already out')
  assert.equal(releaseStatus(album({ releaseDate: '2027-06-01' }), TODAY), null, 'too far away to matter')
  assert.equal(releaseStatus(album({ id: 'alb-default', tracks: [] }), TODAY), null, 'the empty placeholder release')
  assert.equal(releaseStatus(album({ releaseDate: '2026-10-26' }), TODAY)!.daysToRelease, 0, 'out today still counts')
})
check('what is late, the most overdue first, and whether anyone is really using the checklist', () => {
  const s = releaseStatus(album(), TODAY)!
  assert.equal(s.daysToRelease, 25)
  assert.deepEqual(s.late.map(x => x.item.key).slice(0, 2), ['splits', 'samples'])       // due 56 days out: 31 days late
  assert.equal(s.engaged, false)
  const done = (keys: string[]) => defaultChecklist().map(i => (keys.includes(i.key) ? { ...i, done: true } : i))
  assert.equal(releaseStatus(album({ checklist: done(['splits', 'samples']) }), TODAY)!.engaged, false, 'two ticks is not "using it"')
  const used = releaseStatus(album({ checklist: done(['splits', 'samples', 'labelcopy']) }), TODAY)!
  assert.equal(used.engaged, true); assert.ok(!used.late.some(x => x.item.key === 'splits'))
  const noted = releaseStatus(album({ checklist: defaultChecklist().map(i => (['upc', 'isrc'].includes(i.key) ? { ...i, note: ' sent ' } : i.key === 'splits' ? { ...i, done: true } : i)) }), TODAY)!
  assert.equal(noted.engaged, true, 'notes count like ticks')
  assert.equal(releaseStatus(album({ checklist: defaultChecklist().map(i => (['upc', 'isrc', 'artwork'].includes(i.key) ? { ...i, note: '  ' } : i)) }), TODAY)!.engaged, false, 'a blank note is not use')
})
check('a release with every step done has nothing late; one with no saved checklist uses the standard steps', () => {
  const all = releaseStatus(album({ checklist: defaultChecklist().map(i => ({ ...i, done: true })) }), TODAY)!
  assert.deepEqual(all.late, [])
  assert.equal(checklistOf(album()).length, defaultChecklist().length); assert.equal(checklistOf(album({ checklist: [] })).length, defaultChecklist().length)
  const key: ChecklistItemKey = 'upc'
  assert.equal(checklistOf(album({ checklist: [{ key, label: 'x', phase: 'Release Assets', done: false }] })).length, 1)
})
console.log(`${n} checks passed`)
