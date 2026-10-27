// Checks the "add to home screen" setup: the manifest points at icons that exist and are the size they say, and the sign-in gate lets the
// manifest through (a phone fetches it before anyone is signed in).  Run with:  npx tsx scripts/check-app-manifest.ts
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import manifest from '../src/app/manifest'

let n = 0
const check = (name: string, fn: () => void) => { fn(); n++; console.log('  ok  ' + name) }
const png = (path: string) => {
  const b = readFileSync(path)
  assert.equal(b.subarray(1, 4).toString(), 'PNG', `${path} is a PNG`)
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`
}
const m = manifest()

check('it opens like an app, from the front page', () => {
  assert.equal(m.display, 'standalone'); assert.equal(m.start_url, '/'); assert.ok(m.name && m.short_name)
})
check('every icon it names exists and is the size it claims', () => {
  assert.ok((m.icons ?? []).length >= 3)
  for (const i of m.icons ?? []) { assert.ok(i.src.startsWith('/'), i.src); assert.equal(png('public' + i.src), i.sizes, i.src) }
})
check('there is a 192 and a 512 icon (what installing needs) and one that survives being cropped round', () => {
  const sizes = (m.icons ?? []).filter(i => i.purpose !== 'maskable').map(i => i.sizes)
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'))
  assert.ok((m.icons ?? []).some(i => i.purpose === 'maskable'))
})
check('the iPhone icon is there at 180 x 180 and the page names it', () => {
  assert.equal(png('public/icons/apple-touch-icon.png'), '180x180')
  assert.ok(readFileSync('src/app/layout.tsx', 'utf8').includes('/icons/apple-touch-icon.png'))
})
check('the manifest file exists where Next serves it from', () => { assert.ok(existsSync('src/app/manifest.ts')) })

// The sign-in gate, called for real (with made-up Supabase settings so it behaves as it does on the live site; nothing is sent anywhere):
// a signed-out visitor is sent to the login page for everything except the manifest, and only the exact address gets through.
async function gate() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'not-a-real-key'
  const { NextRequest } = await import('next/server')
  const { proxy } = await import('../src/proxy')
  const ask = async (path: string) => proxy(new NextRequest(`http://localhost:3000${path}`))
  const open = async (path: string) => { const r = await ask(path); return r.status === 200 && !r.headers.get('location') }
  assert.equal(await open('/manifest.webmanifest'), true, 'the manifest must load before sign-in')
  for (const path of ['/', '/today', '/api/anything', '/manifest.webmanifest/', '/manifest.webmanifest/x', '/Manifest.webmanifest', '/manifest.webmanifest.json', '/manifest.json']) {
    const r = await ask(path)
    assert.equal(r.status, 307, `${path} must still need a sign-in`); assert.ok(r.headers.get('location')?.includes('/login'), path)
  }
  n++; console.log('  ok  the sign-in gate lets the manifest through, and nothing else')
  console.log(`${n} checks passed`)
}
gate().catch(e => { console.error(e); process.exit(1) })
