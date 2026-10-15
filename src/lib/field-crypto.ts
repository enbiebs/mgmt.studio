// Server-only: scrambles private profile details before they are stored, and unscrambles them for the
// few server routes that are allowed to. AES-256-GCM with a fresh random value for every save.
//
// Each scrambled value is also tied to WHERE it lives ("client|subject|tier"). Someone with raw database
// access who copies one person's scrambled details onto another row gets an error, not a leak.
//
// The key (PROFILE_ENCRYPTION_KEY: 32 random bytes, base64) lives only in the server's settings, never in
// the database. Lose the key and the scrambled details cannot be recovered, so it must be kept somewhere safe.
// Never import this from a 'use client' component.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const VERSION = 'v1'

function loadKey(): Buffer | null {
  const raw = process.env.PROFILE_ENCRYPTION_KEY
  if (!raw) return null
  const key = Buffer.from(raw, 'base64')
  return key.length === 32 ? key : null
}

export const encryptionConfigured = () => loadKey() !== null

export function encryptJson(value: unknown, where: string): string {
  const key = loadKey()
  if (!key) throw new Error('PROFILE_ENCRYPTION_KEY is not set')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(where))
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), body.toString('base64url')].join('.')
}

export function decryptJson<T = unknown>(token: string, where: string): T {
  const key = loadKey()
  if (!key) throw new Error('PROFILE_ENCRYPTION_KEY is not set')
  const [version, iv, tag, body] = token.split('.')
  if (version !== VERSION || !iv || !tag || !body) throw new Error('Unrecognized scrambled value')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  decipher.setAAD(Buffer.from(where))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  const plain = Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()])
  return JSON.parse(plain.toString('utf8')) as T
}

/** What a scrambled value is bound to. */
export const secureLocation = (clientId: string, subject: string, tier: string) => `${clientId}|${subject}|${tier}`
