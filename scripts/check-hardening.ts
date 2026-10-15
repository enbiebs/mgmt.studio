// Checks the security helpers: the sign-in redirect, the shape of every request, and the limits.
// Run with:  npx tsx scripts/check-hardening.ts
import assert from 'node:assert/strict'
import { safeNextPath } from '../src/lib/safe-redirect'
import {
  clientIdSchema, clientAndPath, plaidExchangeBody, inviteBody, gcalConnectBody, gcalPushBody, gcalPushDeleteBody,
  calendarTokenSchema, SECTION_FOR_RECORD,
} from '../src/lib/api-schemas'
import { isClientId, parseJson, LIMITS, addressKey } from '../src/lib/api-guard'

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => schema.safeParse(v).success
const req = (body: string) => new Request('http://x/api', { method: 'POST', body })

async function main() {
  // ── redirect after sign-in: only plain paths on this site
  for (const good of ['/', '/login', '/calendar?x=1', '/a/b#c']) assert.equal(safeNextPath(good), good, good)
  for (const bad of ['@evil.com', '.evil.com', '//evil.com', '/\\evil.com', 'https://evil.com', 'evil.com', 'javascript:alert(1)', '/a\nb', '', null, undefined])
    assert.equal(safeNextPath(bad as string | null | undefined), '/', String(bad))
  // building the URL the way the route does can never leave the site
  for (const next of ['/ok', '@evil.com', '.evil.com', '//evil.com', '/\\evil.com', '/%0d%0aSet-Cookie', '/%2f%2fevil.com']) {
    assert.equal(new URL(safeNextPath(next), 'https://www.mgmtpath.com').origin, 'https://www.mgmtpath.com', next)
  }
  // …and the unsafe version really was open (proves the fix matters)
  assert.equal(new URL('https://www.mgmtpath.com@evil.com').host, 'evil.com')

  // ── ids
  for (const g of ['nimino-7tohmry', 'demo-nova-lane', 'client_1.a']) { assert.ok(isClientId(g)); assert.ok(ok(clientIdSchema, g)) }
  for (const b of ['', '../x', 'a b', 'a/b', "x';drop", 'a'.repeat(101), 5, null, undefined]) { assert.ok(!isClientId(b), String(b)); assert.ok(!ok(clientIdSchema, b)) }

  // ── request shapes
  assert.ok(ok(clientAndPath, { clientId: 'c1', path: 'c1/abc.pdf' }))
  assert.ok(!ok(clientAndPath, { clientId: 'c1' }))
  assert.ok(!ok(clientAndPath, { clientId: 'c1', path: 'x'.repeat(301) }))
  assert.ok(ok(plaidExchangeBody, { clientId: 'c1', publicToken: 'public-sandbox-1234567890', institutionName: null }))
  assert.ok(!ok(plaidExchangeBody, { clientId: 'c1', publicToken: 'short' }))
  // invites: only the roles the screen offers, valid email, artist invites need an artist
  assert.ok(ok(inviteBody, { email: 'a@b.co', role: 'team', personId: 'p1' }))
  assert.ok(ok(inviteBody, { email: 'a@b.co', role: 'artist', clientId: 'c1' }))
  assert.ok(!ok(inviteBody, { email: 'a@b.co', role: 'artist' }))
  assert.ok(!ok(inviteBody, { email: 'a@b.co', role: 'manager' }))
  assert.ok(!ok(inviteBody, { email: 'not-an-email', role: 'team' }))
  assert.ok(!ok(inviteBody, { email: 'a@b.co', role: 'team', clientId: '../x' }))
  // Google state is split on ":", so a time zone can never contain one
  assert.ok(ok(gcalConnectBody, { clientId: 'c1', timeZone: 'America/Los_Angeles' }))
  assert.ok(ok(gcalConnectBody, { clientId: 'c1' }))
  assert.ok(!ok(gcalConnectBody, { clientId: 'c1', timeZone: 'a:b:c' }))
  assert.ok(ok(gcalPushBody, { clientId: 'c1', recordType: 'show', record: { id: 's1', venue: 'x' } }))
  assert.ok(!ok(gcalPushBody, { clientId: 'c1', recordType: 'album', record: { id: 's1' } }))
  assert.ok(!ok(gcalPushBody, { clientId: 'c1', recordType: 'show', record: {} }))
  assert.ok(ok(gcalPushDeleteBody, { clientId: 'c1', recordType: 'post', recordId: 'p1' }))
  assert.deepEqual(SECTION_FOR_RECORD, { show: 'tour', post: 'content', project: 'projects' })
  // calendar feed tokens are UUIDs
  assert.ok(ok(calendarTokenSchema, crypto.randomUUID()))
  for (const b of ['abc', '../../etc', 'x'.repeat(36), '']) assert.ok(!ok(calendarTokenSchema, b), b)

  // ── reading a body
  const good = await parseJson(req('{"clientId":"c1"}'), clientAndPath.pick({ clientId: true }))
  assert.ok('data' in good && good.data?.clientId === 'c1')
  const notJson = await parseJson(req('{nope'), clientAndPath)
  assert.equal('error' in notJson && notJson.error!.status, 400)
  const wrong = await parseJson(req('{"clientId":5}'), clientAndPath)
  assert.equal('error' in wrong && wrong.error!.status, 400)
  const big = await parseJson(req('{"a":"' + 'x'.repeat(200) + '"}'), clientAndPath, 100)
  assert.equal('error' in big && big.error!.status, 413)
  // the error never echoes what was sent or says why
  const body = await ('error' in wrong ? wrong.error!.json() : null)
  assert.ok(!JSON.stringify(body).includes('clientId'))

  // ── limits are sane: every kind exists and the AI one is the tightest per hour
  for (const k of ['ai', 'upload', 'file', 'bank', 'invite', 'sync', 'api', 'public'] as const) assert.ok(LIMITS[k].max > 0 && LIMITS[k].windowSeconds > 0, k)
  assert.ok(LIMITS.invite.max <= 10 && LIMITS.ai.windowSeconds === 3600)

  // ── an address is scrambled, stable, and different per address
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  const a1 = addressKey(new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' } }))
  const a2 = addressKey(new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.9' } }))
  const a3 = addressKey(new Request('http://x', { headers: { 'x-forwarded-for': '203.0.113.10' } }))
  assert.equal(a1, a2); assert.notEqual(a1, a3); assert.ok(!a1.includes('203.0.113'))
  console.log('harden: all checks passed')
}
main().catch(e => { console.error(e); process.exit(1) })
