// Checks the scheduled jobs are wired so they actually run: every cron in vercel.json has a route that checks the secret, is let past the
// sign-in gate (a cron has no login, so without this it is bounced to /login and silently never runs), and there are no more than the
// two the free Vercel plan allows (a third makes the whole deploy fail).  Run with:  npx tsx scripts/check-cron.ts
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'

const root = new URL('..', import.meta.url).pathname
const crons = (JSON.parse(readFileSync(root + 'vercel.json', 'utf8')).crons ?? []) as { path: string; schedule: string }[]
const proxy = readFileSync(root + 'src/proxy.ts', 'utf8')

assert.ok(crons.length >= 1 && crons.length <= 2, `${crons.length} crons (the free plan allows 2)`)
for (const c of crons) {
  const file = root + 'src/app' + c.path + '/route.ts'
  assert.ok(existsSync(file), `${c.path} has a route`)
  const src = readFileSync(file, 'utf8')
  assert.ok(src.includes('process.env.CRON_SECRET') && src.includes('`Bearer ${process.env.CRON_SECRET}`'), `${c.path} checks the secret`)
  assert.ok(src.includes('export async function GET'), `${c.path} answers GET (that is what Vercel sends)`)
  assert.ok(proxy.includes(`pathname === '${c.path}'`), `${c.path} is let past the sign-in gate`)
  assert.match(c.schedule, /^\d+ \d+ \* \* \*$/, `${c.path} runs once a day`)
}
// The old address of the morning job still works by hand.
assert.ok(existsSync(root + 'src/app/api/google-calendar/sync/route.ts'))
// The morning job: dry run does not touch anything, and email is off unless set up.
const daily = readFileSync(root + 'src/app/api/cron/daily/route.ts', 'utf8')
assert.ok(daily.includes("get('dryRun') === '1'") && daily.includes("dryRun ? Promise.resolve('skipped (dry run)')"), 'dry run skips the calendar pull')
assert.ok(daily.includes('Promise.allSettled'), 'one job failing cannot stop the other')
// Links people click without being signed in must be let past the sign-in gate, and must check their own signature.
assert.ok(proxy.includes("pathname === '/api/email/unsubscribe'"), 'the stop-these-emails link works without a login')
const stop = readFileSync(root + 'src/app/api/email/unsubscribe/route.ts', 'utf8')
assert.ok(stop.includes('checkUnsubscribe(') && stop.includes("rateLimit(addressKey(req), 'public')"), 'the stop link checks its signature and is rate limited')
console.log('cron checks passed')
