// Checks which Content tabs a person sees: Studio and Lab are not built yet, so they stay hidden unless "show unfinished" is on.
// Run with:  npx tsx scripts/check-content-tabs.ts
import assert from 'node:assert/strict'
import { contentSubFor, contentTabFor, contentTabVisible, UNFINISHED_CONTENT_TABS } from '../src/lib/unfinished'

assert.deepEqual([...UNFINISHED_CONTENT_TABS].sort(), ['lab', 'studio'])
assert.deepEqual(['manage', 'studio', 'lab'].map(k => contentTabVisible(k, false)), [true, false, false], 'only Manage is real')
assert.deepEqual(['manage', 'studio', 'lab'].map(k => contentTabVisible(k, true)), [true, true, true], 'a manager can switch the unfinished ones on')
assert.deepEqual((['manage', 'studio', 'lab'] as const).map(k => contentTabFor(k, false)), ['manage', 'manage', 'manage'], 'an old link or saved tab to Studio or Lab lands on Manage')
assert.deepEqual((['manage', 'studio', 'lab'] as const).map(k => contentTabFor(k, true)), ['manage', 'studio', 'lab'], 'with unfinished on, nothing is redirected')
// ── the tab that is shown (and lit up in the tab bar) is worked out in one place ──
assert.equal(contentSubFor('studio', undefined, false), 'manage', 'a stale Studio selection shows Manage')
assert.equal(contentSubFor('studio', undefined, true), 'studio')
assert.equal(contentSubFor('lab', undefined, false), 'manage')
assert.equal(contentSubFor('manage', undefined, false), 'manage')
assert.equal(contentSubFor('studio', ['manage'], true), 'manage', 'someone limited to shared items stays inside what they may open')
assert.equal(contentSubFor('studio', ['manage'], false), 'manage')

console.log('content-tabs checks passed')
