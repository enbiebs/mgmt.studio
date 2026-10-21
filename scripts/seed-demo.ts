// Prints the SQL that replaces the demo artist ("Nova Lane (Demo)") with a fresh, consistent story dated from today.
// It only PRINTS: nothing touches the database until the SQL is run (in the Supabase SQL editor, or through the Supabase tool).
//
//   npx tsx scripts/seed-demo.ts                    prints the real SQL, dated from today
//   npx tsx scripts/seed-demo.ts --dry-run          the same SQL, ending in a deliberate error so nothing is kept (a safe trial run)
//   npx tsx scripts/seed-demo.ts --date 2026-11-02  dated from another day
//   npx tsx scripts/seed-demo.ts --out demo.sql     writes to a file instead of printing
//   also: --owner <user id>
//
// Run it again any day to move the whole demo forward to that day (it replaces only the demo artist's records).
import { writeFileSync } from 'node:fs'
import { DEMO_CLIENT_ID, buildDemoRows } from '../src/lib/demo-seed'
import { demoSql } from '../src/lib/demo-sql'

// Accepts "--date 2026-11-02" and "--date=2026-11-02"; anything unknown, or a flag with no value, is an error rather than quietly ignored.
const VALUE_FLAGS = ['date', 'owner', 'out']
const BOOLEAN_FLAGS = ['dry-run']
const args = new Map<string, string | true>()
for (let i = 2; i < process.argv.length; i++) {
  const raw = process.argv[i]
  const m = /^--([a-z-]+)(?:=(.*))?$/.exec(raw)
  if (!m) throw new Error(`Unexpected "${raw}". Flags look like --date 2026-11-02 or --dry-run.`)
  const [, name, inline] = m
  if (BOOLEAN_FLAGS.includes(name)) { args.set(name, true); continue }
  if (!VALUE_FLAGS.includes(name)) throw new Error(`Unknown flag --${name}. Known: ${[...VALUE_FLAGS, ...BOOLEAN_FLAGS].map(f => `--${f}`).join(', ')}`)
  const value = inline ?? process.argv[++i]
  if (!value || value.startsWith('--')) throw new Error(`--${name} needs a value.`)
  args.set(name, value)
}
const arg = (name: string): string | undefined => { const v = args.get(name); return typeof v === 'string' ? v : undefined }
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const anchor = arg('date') ?? today

const ctx = {
  anchor,
  clientId: DEMO_CLIENT_ID,
  ownerUserId: arg('owner') ?? 'f7303cf1-f728-46a2-a861-dc7787c00d9c',
}
const rows = buildDemoRows(ctx)
const sql = demoSql(ctx, rows, { dryRun: args.has('dry-run') })

const out = arg('out')
if (out) {
  writeFileSync(out, sql + '\n')
  const rowCount = Object.values(rows).reduce((a, l) => a + l.length, 0)
  console.log(`Wrote ${out}: ${rowCount} rows in ${Object.keys(rows).length} tables, dated from ${anchor}, ${Math.round(sql.length / 1024)} KB.`)
} else {
  console.log(sql)
}
