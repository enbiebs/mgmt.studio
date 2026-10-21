// Every scheduled job in vercel.json is called by Vercel with no sign-in, so src/proxy.ts must let its path through (the job checks
// CRON_SECRET itself), and the route must check that secret. Without the exemption the job is turned away at the login page and silently
// never runs.  Run with:  npx tsx scripts/check-cron-paths.ts
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const crons = (JSON.parse(readFileSync('vercel.json', 'utf8')).crons ?? []) as { path: string; schedule: string }[]
assert.ok(crons.length > 0, 'vercel.json lists the scheduled jobs')
const proxy = readFileSync('src/proxy.ts', 'utf8')
for (const { path, schedule } of crons) {
  assert.ok(/^[0-9*/, -]+( [0-9*/, -]+){4}$/.test(schedule), `${path}: "${schedule}" looks like a cron schedule`)
  assert.ok(proxy.includes(`request.nextUrl.pathname === '${path}'`), `${path}: src/proxy.ts lets the job through without a sign-in (else it is redirected to /login and never runs)`)
  const route = `src${path.replace(/^\/api/, '/app/api')}/route.ts`
  assert.ok(existsSync(route), `${path}: ${route} exists`)
  assert.ok(readFileSync(route, 'utf8').includes('CRON_SECRET'), `${path}: the route checks CRON_SECRET (it is open to the internet otherwise)`)
}
console.log('cron-paths checks passed')
