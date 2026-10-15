// Checks the Accounts list logic. Run with:  npx tsx scripts/check-accounts.ts
import assert from 'node:assert/strict'
import { accountIssues, guessCategory, needsAttention, parseAccountsSheet, parseCsv, PLATFORM_PRESETS } from '../src/lib/accounts'
import type { ArtistAccount } from '../src/types'

const acc = (over: Partial<ArtistAccount> = {}): ArtistAccount => ({ id: 'a1', platform: 'Spotify for Artists', category: 'social', access: 'platform', twoFactor: 'app', ...over })
const keys = (a: ArtistAccount) => accountIssues(a, '2026-10-15').map(i => i.key).sort()

// ── issues
assert.deepEqual(keys(acc()), [])
assert.ok(!needsAttention(acc(), '2026-10-15'))
assert.deepEqual(keys(acc({ access: 'unsorted' })), ['unsorted'])
assert.deepEqual(keys(acc({ access: 'artist' })), ['artist-only'])
assert.deepEqual(keys(acc({ access: 'manager' })), ['no-link'])
assert.deepEqual(keys(acc({ access: 'manager', vaultUrl: 'https://vault.example.invalid/1' })), [])
assert.deepEqual(keys(acc({ twoFactor: 'sms' })), ['sms'])
assert.deepEqual(keys(acc({ twoFactor: 'none' })), ['no-2fa'])
assert.deepEqual(keys(acc({ twoFactor: 'unknown' })), ['unknown-2fa'])
assert.deepEqual(keys(acc({ lastChanged: '2025-10-14' })), ['stale'])         // one year and a day
assert.deepEqual(keys(acc({ lastChanged: '2025-10-15' })), [])                // exactly a year: fine
assert.deepEqual(keys(acc({ access: 'unsorted', twoFactor: 'sms' })), ['sms', 'unsorted'])
assert.ok(needsAttention(acc({ twoFactor: 'sms' }), '2026-10-15'))
assert.ok(!needsAttention(acc({ twoFactor: 'unknown' }), '2026-10-15'))       // a note is not an alarm

// ── categories
assert.equal(guessCategory('Spotify'), 'social')
assert.equal(guessCategory('Spotify for Artists'), 'social')
assert.equal(guessCategory('Distrokid'), 'rights')
assert.equal(guessCategory('BMI'), 'rights')
assert.equal(guessCategory('PayPal'), 'money')
assert.equal(guessCategory('Email (Bookings)'), 'email')
assert.equal(guessCategory('Shopify'), 'merch')
assert.equal(guessCategory('Mailchimp'), 'fans')
assert.equal(guessCategory('Dropbox'), 'storage')
assert.equal(guessCategory('Some Brand New Tool'), 'other')
assert.equal(guessCategory(''), 'other')
// presets are safe, well-formed, and in a known group
for (const p of PLATFORM_PRESETS) {
  assert.ok(!p.loginUrl || /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\/?$/i.test(p.loginUrl) || /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}$/i.test(p.loginUrl), p.name)
  assert.ok(['social', 'rights', 'money', 'email', 'merch', 'fans', 'storage'].includes(p.category), p.name)
}

// ── reading a sheet: platform and username come out, passwords never do
const FAKE_PW = ['hunter2-FAKE', 'Correct-Horse-FAKE', 'pw-three-FAKE']
const rows: unknown[][] = [
  [null, null, null],
  ['WEBSITE/APP', 'USR', 'PW'],
  ['Spotify', 'a@example.invalid', FAKE_PW[0]],
  ['Instagram', 'artistname', FAKE_PW[1]],
  ['Instagram', 'ARTISTNAME', FAKE_PW[1]],     // duplicate (case differs)
  ['Facebook', '', ''],                         // a platform with no login saved
  ['', 'orphan', FAKE_PW[2]],                   // no platform: skipped
  ['  Distrokid  ', 'x@example.invalid', FAKE_PW[2]],
]
const parsed = parseAccountsSheet(rows)
assert.equal(parsed.found, true)
assert.equal(parsed.hadPasswordColumn, true)
assert.deepEqual(parsed.items.map(i => i.platform), ['Spotify', 'Instagram', 'Facebook', 'Distrokid'])
assert.deepEqual(parsed.items.map(i => i.username), ['a@example.invalid', 'artistname', '', 'x@example.invalid'])
const dump = JSON.stringify(parsed)
for (const pw of FAKE_PW) assert.ok(!dump.includes(pw), 'a password leaked into the result: ' + pw)

// headings in other words, a header lower down, and the password column first
const other = parseAccountsSheet([['My logins'], [], ['Password', 'Service', 'Login'], [FAKE_PW[0], 'TikTok', 'tt_user']])
assert.deepEqual(other.items, [{ platform: 'TikTok', username: 'tt_user' }])
assert.ok(!JSON.stringify(other).includes(FAKE_PW[0]))
// a sheet with nothing that looks like logins
assert.equal(parseAccountsSheet([['Date', 'Venue'], ['2026-01-01', 'Fabric']]).found, false)
assert.equal(parseAccountsSheet([]).found, false)
// non-text cells and very long values are handled
const odd = parseAccountsSheet([['App', 'Username'], [123 as unknown, 'x'], ['A'.repeat(300), 'u'.repeat(500)]])
assert.equal(odd.items.length, 1)
assert.equal(odd.items[0].platform.length, 100); assert.equal(odd.items[0].username.length, 200)

// ── CSV
assert.deepEqual(parseCsv('a,b,c\n1,2,3\n'), [['a', 'b', 'c'], ['1', '2', '3']])
assert.deepEqual(parseCsv('a,"b,c","say ""hi"""\r\nx,y,z'), [['a', 'b,c', 'say "hi"'], ['x', 'y', 'z']])
assert.deepEqual(parseCsv('a,"two\nlines",c'), [['a', 'two\nlines', 'c']])
assert.deepEqual(parseCsv('\n\n,,\na,b'), [['a', 'b']])
const csvParsed = parseAccountsSheet(parseCsv(`WEBSITE/APP,USR,PW\nSpotify,a@example.invalid,${FAKE_PW[0]}\nBeatport,"u,1",${FAKE_PW[1]}`))
assert.deepEqual(csvParsed.items, [{ platform: 'Spotify', username: 'a@example.invalid' }, { platform: 'Beatport', username: 'u,1' }])
assert.ok(!JSON.stringify(csvParsed).includes('FAKE'))

console.log('accounts: all checks passed')
