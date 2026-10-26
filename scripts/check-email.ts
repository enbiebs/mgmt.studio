// Checks the email building blocks: what counts as an address, cleaning words for strangers, the sender (off by default, one-click stop
// header, no double delivery, a hung mail service cannot hang us), and the signed "stop these emails" link.
// Run with:  npx tsx scripts/check-email.ts
import assert from 'node:assert/strict'
import { looksLikeEmail, plainLine, esc } from '../src/lib/email-address'
import { emailConfig, mayEmail, sendEmail, SEND_TIMEOUT_MS, type Email } from '../src/lib/email'
import { checkUnsubscribe, unsubscribeToken, unsubscribeUrl } from '../src/lib/email-unsubscribe'
import { appUrlFrom } from '../src/lib/daily-email-server'

let n = 0
const check = async (name: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log('  ok  ' + name) }

async function main() {
  await check('what is an address', () => {
    for (const ok of ['a@b.co', 'first.last+tag@sub.example.com', 'A_B-c@x-y.org']) assert.ok(looksLikeEmail(ok), ok)
    for (const bad of ['', 'a', 'a@', '@b.com', 'a@b', 'a@b.c', 'a@b..com', 'a@.com', 'a@b.com.', '.a@b.com', 'a.@b.com', 'a..b@b.com', 'a@-b.com', 'a@b-.com', 'a@[1.2.3.4]', 'a b@c.com', 'a@b.com?x=1', 'a@b.com&x', 'a@b.com#x', 'a%b@c.com', 'a@b@c.com', 'a@b.c0m', 'a\u0000@b.com', 'ä@b.com', 'a@bücher.de', 'x'.repeat(65) + '@b.com', 'a@' + 'x'.repeat(250) + '.com']) assert.ok(!looksLikeEmail(bad), JSON.stringify(bad))
  })

  await check('words from somebody else are made safe for a stranger', () => {
    assert.equal(plainLine('  Deal\r\n  <b>one</b>  ', 50), 'Deal b one /b')
    assert.equal(plainLine('see https://evil.example/x?y=1 and www.evil.example now', 80), 'see [link removed] and [link removed] now')
    assert.equal(plainLine('x'.repeat(100), 10), 'xxxxxxxxx…')
    assert.equal(plainLine('short', 10), 'short')
    assert.doesNotThrow(() => encodeURIComponent(plainLine('😀'.repeat(50), 11)), 'an emoji is not cut in half')
    assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;')
  })

  const ON = { RESEND_API_KEY: 'key', EMAIL_FROM: 'Mgmt Path <n@example.com>' }
  const msg: Email = { to: 'a@x.org', subject: 'S', text: 'T', html: '<p>H</p>' }

  await check('email is off until a key and a from-address are set', async () => {
    assert.equal(emailConfig({}), null); assert.equal(emailConfig({ RESEND_API_KEY: 'k' }), null); assert.equal(emailConfig({ EMAIL_FROM: 'f' }), null)
    assert.ok(emailConfig(ON))
    let called = 0
    const r = await sendEmail(msg, {}, (async () => { called++; return new Response('{}') }) as typeof fetch)
    assert.deepEqual(r, { ok: false, reason: 'off' }); assert.equal(called, 0)
  })

  await check('a try-out list limits who gets mail; a bad address is refused before anything is sent', async () => {
    const only = { ...ON, EMAIL_ONLY_TO: ' Eli@Noted.com , other@x.org ' }
    assert.equal(mayEmail('eli@noted.com', only).ok, true); assert.equal(mayEmail('ELI@NOTED.COM', only).ok, true)
    assert.deepEqual(mayEmail('sam@x.org', only), { ok: false, reason: 'not-allowed' })
    assert.deepEqual(mayEmail('nonsense', ON), { ok: false, reason: 'bad-address' })
  })

  await check('what goes to the mail service: the key, one recipient, the once-only key, the stop link, a time limit', async () => {
    let seen: { url: string; init: RequestInit } | null = null
    const fakeFetch = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response('{"id":"1"}', { status: 200 }) }) as unknown as typeof fetch
    const r = await sendEmail({ ...msg, key: 'contract:k1:2026-12-01:90:a@x.org', unsubscribeUrl: 'https://s.test/stop?a=1' }, ON, fakeFetch)
    assert.deepEqual(r, { ok: true })
    const s = seen as unknown as { url: string; init: RequestInit }
    assert.equal(s.url, 'https://api.resend.com/emails')
    const h = s.init.headers as Record<string, string>
    assert.equal(h.Authorization, 'Bearer key'); assert.equal(h['Idempotency-Key'], 'contract:k1:2026-12-01:90:a@x.org')
    const body = JSON.parse(s.init.body as string)
    assert.deepEqual(body.to, ['a@x.org']); assert.equal(body.from, ON.EMAIL_FROM)
    assert.equal(body.headers['List-Unsubscribe'], '<https://s.test/stop?a=1>'); assert.equal(body.headers['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
    assert.ok(s.init.signal instanceof AbortSignal, 'a mail service that never answers is given up on'); assert.ok(SEND_TIMEOUT_MS <= 15_000)
    // no key, no stop link: neither header is sent
    await sendEmail(msg, ON, fakeFetch)
    const s2 = seen as unknown as { init: RequestInit }
    assert.ok(!('Idempotency-Key' in (s2.init.headers as object))); assert.ok(!('headers' in JSON.parse(s2.init.body as string)))
  })

  await check('a failure is reported, never thrown', async () => {
    assert.deepEqual(await sendEmail(msg, ON, (async () => new Response('no', { status: 422 })) as typeof fetch), { ok: false, reason: 'failed' })
    assert.deepEqual(await sendEmail(msg, ON, (async () => { throw new Error('boom') }) as typeof fetch), { ok: false, reason: 'failed' })
    assert.deepEqual(await sendEmail(msg, ON, (async () => { throw new DOMException('timed out', 'TimeoutError') }) as typeof fetch), { ok: false, reason: 'failed' })
  })

  const ENV = { SUPABASE_SERVICE_ROLE_KEY: 'server-secret' }
  await check('the stop link is signed: it works for its own address and for nobody else', () => {
    const url = unsubscribeUrl('https://www.mgmtpath.com', 'Lawyer@Firm.com', ENV)!
    assert.match(url, /^https:\/\/www\.mgmtpath\.com\/api\/email\/unsubscribe\?a=lawyer%40firm\.com&t=[0-9a-f]{64}$/)
    const q = new URL(url).searchParams
    assert.equal(checkUnsubscribe(q.get('a'), q.get('t'), ENV), 'lawyer@firm.com')
    assert.equal(checkUnsubscribe('other@firm.com', q.get('t'), ENV), null, 'the same signature does not work for another address')
    assert.equal(checkUnsubscribe(q.get('a'), q.get('t')!.replace(/.$/, c => (c === '0' ? '1' : '0')), ENV), null, 'a changed signature fails')
    assert.equal(checkUnsubscribe(q.get('a'), 'abc', ENV), null); assert.equal(checkUnsubscribe(q.get('a'), '', ENV), null)
    assert.equal(checkUnsubscribe(null, null, ENV), null); assert.equal(checkUnsubscribe(5, 6, ENV), null)
    assert.equal(checkUnsubscribe(q.get('a'), q.get('t'), { SUPABASE_SERVICE_ROLE_KEY: 'another-secret' }), null, 'a different server secret does not accept it')
    assert.notEqual(unsubscribeToken('a@x.org', ENV), unsubscribeToken('b@x.org', ENV))
    assert.equal(unsubscribeToken('A@X.org', ENV), unsubscribeToken('a@x.org', ENV), 'case does not matter')
  })
  await check('with no server secret no link can be made or accepted', () => {
    assert.equal(unsubscribeUrl('https://x.test', 'a@x.org', {}), null)
    assert.equal(checkUnsubscribe('a@x.org', '', {}), null)
    assert.equal(checkUnsubscribe('not-an-address', unsubscribeToken('not-an-address', ENV), ENV), null)
  })

  await check('links in emails use APP_URL only when it is a real web address', () => {
    assert.equal(appUrlFrom({}), 'https://www.mgmtpath.com')
    assert.equal(appUrlFrom({ APP_URL: 'https://app.example.com/' }), 'https://app.example.com')
    assert.equal(appUrlFrom({ APP_URL: 'mgmtpath.com' }), 'https://www.mgmtpath.com', 'a bare name (no https://) would make every link break')
    assert.equal(appUrlFrom({ APP_URL: 'javascript:alert(1)' }), 'https://www.mgmtpath.com')
    assert.equal(appUrlFrom({ APP_URL: '  ' }), 'https://www.mgmtpath.com')
  })

  console.log(`${n} checks passed`)
}
main().catch(e => { console.error(e); process.exit(1) })
