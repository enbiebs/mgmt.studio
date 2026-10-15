// Checks the scrambling of private profile details.  Run with:  npx tsx scripts/check-field-crypto.ts
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { encryptJson, decryptJson, encryptionConfigured, secureLocation } from '../src/lib/field-crypto'
import { privateGroupsFor, privateKeysFor, PRIVATE_GROUPS } from '../src/lib/profile-fields'

delete process.env.PROFILE_ENCRYPTION_KEY
assert.equal(encryptionConfigured(), false)
assert.throws(() => encryptJson({ a: 1 }, 'x'), /not set/)

process.env.PROFILE_ENCRYPTION_KEY = randomBytes(32).toString('base64')
assert.equal(encryptionConfigured(), true)

const where = secureLocation('c1', 'artist', 'private')
const secret = { dob: '01/02/1990', homeAddress: '1 Test St\nLine two', ff_delta: '123456789', unicode: 'Zoë ✓' }
const token = encryptJson(secret, where)
assert.ok(token.startsWith('v1.'))
assert.ok(!token.includes('1 Test St') && !token.includes('123456789'), 'the scrambled value must not contain the plain text')
assert.deepEqual(decryptJson(token, where), secret)

// every save is different, even for identical details
assert.notEqual(encryptJson(secret, where), encryptJson(secret, where))

// bound to where it lives: moving it to another artist, person, or tier fails
for (const other of [secureLocation('c2', 'artist', 'private'), secureLocation('c1', 'person-9', 'private'), secureLocation('c1', 'artist', 'vault')])
  assert.throws(() => decryptJson(token, other), Error, other)

// tampering is detected
const parts = token.split('.')
const flipped = Buffer.from(parts[3], 'base64url'); flipped[0] ^= 1
assert.throws(() => decryptJson([parts[0], parts[1], parts[2], flipped.toString('base64url')].join('.'), where))
assert.throws(() => decryptJson(token.replace('v1.', 'v9.'), where))
assert.throws(() => decryptJson('garbage', where))

// the wrong key cannot open it
process.env.PROFILE_ENCRYPTION_KEY = randomBytes(32).toString('base64')
assert.throws(() => decryptJson(token, where))

// a key of the wrong length is treated as "not set up"
process.env.PROFILE_ENCRYPTION_KEY = Buffer.from('short').toString('base64')
assert.equal(encryptionConfigured(), false)

// field lists: the tax ID belongs to the artist only; every key is unique
assert.ok(privateKeysFor('artist').has('taxId'))
assert.ok(!privateKeysFor('person-9').has('taxId'))
assert.ok(privateGroupsFor('person-9').every(g => g.fields.length > 0))
const all = PRIVATE_GROUPS.flatMap(g => g.fields.map(f => f.key))
assert.equal(new Set(all).size, all.length, 'duplicate field keys')
console.log('field-crypto: all checks passed')
