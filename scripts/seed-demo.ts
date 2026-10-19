// Prints the SQL that replaces the demo artist ("Nova Lane (Demo)") with a fresh, consistent story dated from today.
// It only PRINTS: nothing touches the database until the SQL is run (in the Supabase SQL editor, or through the Supabase tool).
//
//   npx tsx scripts/seed-demo.ts                    prints the real SQL, dated from today
//   npx tsx scripts/seed-demo.ts --dry-run          the same SQL, ending in a deliberate error so nothing is kept (a safe trial run)
//   npx tsx scripts/seed-demo.ts --date 2026-11-02  dated from another day
//   npx tsx scripts/seed-demo.ts --out demo.sql     writes to a file instead of printing
//   also: --owner <user id>  --workspace <workspace id>
//
// Run it again any day to move the whole demo forward to that day (it replaces only the demo artist's records).
import { writeFileSync } from 'node:fs'
import { DEMO_CLIENT_ID, buildDemoRows } from '../src/lib/demo-seed'
import { demoSql } from '../src/lib/demo-sql'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}
const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const anchor = arg('date') ?? today
if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || Number.isNaN(Date.parse(anchor))) throw new Error(`--date must look like 2026-11-02, got "${anchor}"`)

const ctx = {
  anchor,
  clientId: DEMO_CLIENT_ID,
  workspaceId: arg('workspace') ?? '873c4c0d-be6a-4ce3-9013-4755a5596299',
  ownerUserId: arg('owner') ?? 'f7303cf1-f728-46a2-a861-dc7787c00d9c',
}
const rows = buildDemoRows(ctx)
const sql = demoSql(ctx, rows, { dryRun: process.argv.includes('--dry-run') })

const out = arg('out')
if (out) {
  writeFileSync(out, sql + '\n')
  const rowCount = Object.values(rows).reduce((a, l) => a + l.length, 0)
  console.log(`Wrote ${out}: ${rowCount} rows in ${Object.keys(rows).length} tables, dated from ${anchor}, ${Math.round(sql.length / 1024)} KB.`)
} else {
  console.log(sql)
}
