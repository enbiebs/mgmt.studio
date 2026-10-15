// Checks the access-level bundles.  Run with:  npx tsx scripts/check-access-presets.ts
import assert from 'node:assert/strict'
import { PRESETS, SECTIONS, levelsOf, matchPreset, otherAccess, planChanges, presetByKey, summarize, type GrantRow } from '../src/lib/access-presets'

const row = (id: string, section: string, clientId: string | null, canEdit: boolean): GrantRow => ({ id, section, client_id: clientId, can_edit: canEdit })

// every preset only uses real sections, and no preset is a copy of another
const keys = new Set<string>(SECTIONS.map(s => s.key))
for (const p of PRESETS) for (const k of Object.keys(p.levels)) assert.ok(keys.has(k), `${p.key}: unknown section ${k}`)
assert.equal(new Set(PRESETS.map(p => p.key)).size, PRESETS.length)
assert.equal(new Set(PRESETS.map(p => JSON.stringify(p.levels))).size, PRESETS.length)

// nothing that looks like money or contracts is handed to the levels meant to keep them out
for (const k of ['assistant', 'crew', 'creative', 'readonly']) {
  const l = presetByKey(k)!.levels
  assert.ok(!l.finance && !l.legal, `${k} must not see finance or legal`)
}
for (const k of ['crew', 'readonly']) {
  assert.ok(Object.values(presetByKey(k)!.levels).every(v => v === 'view'), `${k} must be look-only`)   // crew and look-only can never change anything
}
assert.deepEqual(presetByKey('crew')!.levels, { tour: 'view' })
assert.ok(presetByKey('crew')!.hidden.includes('offers'))                                                // the plain-language note admits offers are part of Tour
assert.equal(presetByKey('full')!.levels.finance, 'edit')

// reading what is granted for one artist (other artists' rows and unknown sections are ignored)
const grants = [row('1', 'tour', 'a', false), row('2', 'finance', 'b', true), row('3', 'vault', 'a', true), row('4', 'projects', null, true)]
assert.deepEqual(levelsOf(grants, 'a'), { tour: 'view' })
assert.deepEqual(levelsOf(grants, 'b'), { finance: 'edit' })
assert.deepEqual(levelsOf(grants, 'zzz'), {})

// which level it matches
assert.equal(matchPreset([], 'a'), 'none')
assert.equal(matchPreset(grants, 'a'), 'crew')
assert.equal(matchPreset([row('1', 'tour', 'a', true)], 'a'), 'custom')                                  // same section but can change: not the crew level
assert.equal(matchPreset([row('1', 'tour', 'a', false), row('2', 'music', 'a', false)], 'a'), 'custom')
const bookkeeper = [row('1', 'finance', 'a', true), row('2', 'tour', 'a', false)]
assert.equal(matchPreset(bookkeeper, 'a'), 'bookkeeper')
assert.equal(matchPreset(bookkeeper, 'other'), 'none')                                                   // another artist's grants don't count

// planning the change: only this artist's rows are touched, and only what differs
const current = [row('g1', 'tour', 'a', true), row('g2', 'music', 'a', false), row('g3', 'finance', 'a', true), row('g4', 'tour', 'b', true)]
const plan = planChanges(current, 'a', presetByKey('crew')!.levels)
assert.deepEqual(plan.remove.sort(), ['g2', 'g3'])
assert.deepEqual(plan.update, [{ id: 'g1', canEdit: false }])
assert.deepEqual(plan.add, [])
assert.ok(![...plan.remove, ...plan.update.map(u => u.id)].includes('g4'))                               // artist b is untouched
const toFull = planChanges([], 'a', presetByKey('full')!.levels)
assert.equal(toFull.add.length, 9)
assert.ok(toFull.add.every(a => a.canEdit))
assert.deepEqual(planChanges(current, 'a', {}), { remove: ['g1', 'g2', 'g3'], update: [], add: [] })     // "no access" removes all of this artist's rows
assert.deepEqual(planChanges(bookkeeper, 'a', presetByKey('bookkeeper')!.levels), { remove: [], update: [], add: [] })   // already that level: nothing to do
// a level written down as 'none' is the same as leaving it out
assert.deepEqual(planChanges([row('g1', 'tour', 'a', false)], 'a', { tour: 'none', music: 'view' }), { remove: ['g1'], update: [], add: [{ section: 'music', canEdit: false }] })

// the private profile (ID numbers, home address, tax ID) is only in the levels that are meant to include it
for (const p of PRESETS) {
  const profile = p.levels.profile
  assert.equal(!!profile, p.key === 'full', `${p.key}: only Full access includes the profile (found ${profile})`)
}
// every "can't see" line is honest about booking offers living inside Tour wherever Tour is included
for (const p of PRESETS) if (p.levels.tour) assert.ok(/offers/i.test(p.hidden) || p.key === 'full' || p.key === 'bookkeeper', `${p.key}: say that offers (with fees) are part of Tour`)

// choosing a level never touches access the panel can't show (the vault), and says it is there
const withVault = [row('v', 'vault', 'a', true), row('t', 'tour', 'a', true), row('all', 'finance', null, true)]
const toNone = planChanges(withVault, 'a', {})
assert.deepEqual(toNone, { remove: ['t'], update: [], add: [] })                          // only the tour grant goes; the vault and the all-artists grant stay
assert.deepEqual(planChanges(withVault, 'a', presetByKey('full')!.levels).remove, [])
assert.equal(matchPreset(withVault, 'a'), 'custom')                                        // tour edit alone is not one of the levels
assert.deepEqual(otherAccess(withVault, 'a'), ['vault (not shown here)', 'Finance for all artists'])
assert.deepEqual(otherAccess([row('1', 'tour', 'a', false)], 'a'), [])
assert.deepEqual(otherAccess([row('1', 'vault', 'b', false)], 'a'), [])                  // another artist's vault grant is not this artist's business

// plain-language summary
assert.equal(summarize(presetByKey('crew')!.levels), 'Can look at: Tour')
assert.equal(summarize({}), 'Cannot see anything for this artist')
assert.ok(summarize(presetByKey('bookkeeper')!.levels).startsWith('Can change: Finance'))
console.log('access-presets: all checks passed')
