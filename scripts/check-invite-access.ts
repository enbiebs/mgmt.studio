// Checks what an invitation carries.  Run with:  npx tsx scripts/check-invite-access.ts
import assert from 'node:assert/strict'
import { INVITE_SECTION_KEYS, MAX_INVITE_ARTISTS, inviteGrantRows, inviteIsEmpty, loginTypeFor } from '../src/lib/invite-access'
import { inviteBody, inviteCancelBody } from '../src/lib/api-schemas'
import { SECTIONS } from '../src/lib/access-presets'

// the login type: agents and lawyers keep theirs, every other role is a teammate
assert.equal(loginTypeFor('agent'), 'agent'); assert.equal(loginTypeFor('lawyer'), 'lawyer')
for (const r of ['tourmanager', 'crew', 'admin', 'businessmanager', 'readonly', 'anything']) assert.equal(loginTypeFor(r), 'team')

// the pages an invite may grant are exactly the page list: never the vault, and 'admin' is the Point Person flag
assert.deepEqual(INVITE_SECTION_KEYS, SECTIONS.map(s => s.key))
const allowed: string[] = INVITE_SECTION_KEYS
assert.ok(!allowed.includes('vault')); assert.ok(!allowed.includes('admin'))

// pages become rows, one per page per artist
assert.deepEqual(inviteGrantRows([{ clientId: 'a', levels: { tour: 'edit', team: 'view' } }]), [
  { section: 'tour', client_id: 'a', can_edit: true }, { section: 'team', client_id: 'a', can_edit: false },
])
// a Point Person is ONE admin row, and the pages (if any were sent) are ignored
assert.deepEqual(inviteGrantRows([{ clientId: 'a', pointPerson: true, levels: { tour: 'view' } }]), [{ section: 'admin', client_id: 'a', can_edit: true }])
// several artists, a repeated artist counts once, junk levels are dropped
const many = inviteGrantRows([
  { clientId: 'a', levels: { finance: 'edit' } }, { clientId: 'b', pointPerson: true }, { clientId: 'a', levels: { tour: 'edit' } },
  { clientId: 'c', levels: { music: 'nope' as unknown as 'view', legal: 'view' } },
])
assert.deepEqual(many.map(r => `${r.client_id}:${r.section}:${r.can_edit}`), ['a:finance:true', 'b:admin:true', 'c:legal:false'])
assert.ok(inviteIsEmpty([])); assert.ok(inviteIsEmpty([{ clientId: 'a', levels: {} }])); assert.ok(!inviteIsEmpty([{ clientId: 'a', pointPerson: true }]))

// the server's request shape
const ok = { email: 'dana@example.com', role: 'team', personId: 'p1', access: [{ clientId: 'nimino-7tohmry', levels: { tour: 'edit', finance: 'edit' } }, { clientId: 'wes', pointPerson: true }] }
assert.ok(inviteBody.safeParse(ok).success)
assert.ok(inviteBody.safeParse({ email: 'dana@example.com', role: 'agent' }).success)                       // no access: the old shape still works
assert.ok(!inviteBody.safeParse({ ...ok, access: [{ clientId: 'a', levels: { vault: 'edit' } }] }).success)   // never the vault
assert.ok(!inviteBody.safeParse({ ...ok, access: [{ clientId: 'a', levels: { admin: 'edit' } }] }).success)   // a Point Person is the flag, not a page
assert.ok(!inviteBody.safeParse({ ...ok, access: [{ clientId: 'a', levels: { tour: 'owner' } }] }).success)   // only view or edit
assert.ok(!inviteBody.safeParse({ ...ok, access: [{ clientId: '../x' }] }).success)                          // artist ids are plain ids
assert.ok(!inviteBody.safeParse({ ...ok, role: 'manager' }).success)                                        // a manager is never created by an invite
assert.ok(!inviteBody.safeParse({ ...ok, access: Array.from({ length: MAX_INVITE_ARTISTS + 1 }, (_, i) => ({ clientId: 'a' + i })) }).success)
assert.ok(!inviteBody.safeParse({ email: 'x@example.com', role: 'artist', clientId: 'a', access: [{ clientId: 'a', levels: { tour: 'view' } }] }).success)   // an artist login takes no page access
assert.ok(inviteBody.safeParse({ email: 'x@example.com', role: 'artist', clientId: 'a' }).success)
assert.ok(inviteCancelBody.safeParse({ memberId: '3f1c0f3e-5c6b-4c3a-9d55-0d1d3b0f2a11' }).success)
assert.ok(!inviteCancelBody.safeParse({ memberId: 'not-an-id' }).success)

console.log('invite-access: all checks passed')
