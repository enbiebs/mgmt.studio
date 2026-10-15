// Checks reading the details out of an invite link.  Run with:  npx tsx scripts/check-auth-hash.ts
import assert from 'node:assert/strict'
import { hasAuthHash, parseAuthHash } from '../src/lib/auth-hash'

// a good invite link: the sign-in details come back after the "#"
const ok = parseAuthHash('#access_token=AAA&expires_in=3600&refresh_token=BBB&token_type=bearer&type=invite')
assert.deepEqual(ok, { kind: 'session', accessToken: 'AAA', refreshToken: 'BBB', type: 'invite' })
assert.equal(parseAuthHash('access_token=AAA&refresh_token=BBB').kind, 'session')          // works without the "#" too
assert.deepEqual(parseAuthHash('#access_token=AAA&refresh_token=BBB'), { kind: 'session', accessToken: 'AAA', refreshToken: 'BBB', type: null })

// an expired or already-used link comes back as an error
const bad = parseAuthHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
assert.deepEqual(bad, { kind: 'error', message: 'Email link is invalid or has expired' })
assert.equal(parseAuthHash('#error=access_denied').kind, 'error')

// half a link, or nothing at all, is not a sign-in
assert.equal(parseAuthHash('#access_token=AAA').kind, 'none')
assert.equal(parseAuthHash('').kind, 'none')
assert.equal(parseAuthHash('#').kind, 'none')
assert.equal(parseAuthHash('#section=team').kind, 'none')

assert.ok(hasAuthHash('#access_token=AAA&refresh_token=BBB'))
assert.ok(hasAuthHash('#error=access_denied'))
assert.ok(!hasAuthHash('#team'))
assert.ok(!hasAuthHash(''))

console.log('auth-hash checks passed')
