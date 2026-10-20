// Checks when a stored bill PDF kept by a trash copy may be removed: only if it is a PDF in the copy's own artist folder and no live bill
// and no other kept copy points at it; a failed removal is reported; a lookup that cannot be done removes nothing.
// Run with:  npx tsx scripts/check-trash-files.ts
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isBillFilePath, removeBillFiles } from '../src/lib/trash-files'

interface World { liveBills?: string[]; copies?: { id: string; files: string[] }[]; billsLookupFails?: boolean; removeFails?: boolean }
function fake(w: World) {
  const removed: string[][] = []
  const query = (rows: () => { data?: unknown[]; error?: Error }) => {
    let exclude: string | undefined
    const q: Record<string, unknown> = {
      select: () => q, in: () => q, overlaps: () => q, neq: (_c: string, v: string) => { exclude = v; return q },
      then: (ok: (r: unknown) => unknown) => {
        const r = rows()
        const data = exclude && r.data ? (r.data as { id?: string }[]).filter(x => x.id !== exclude) : r.data
        return ok({ data: data ?? null, error: r.error ?? null })
      },
    }
    return q
  }
  const admin = {
    from: (table: string) => table === 'expenses'
      ? query(() => (w.billsLookupFails ? { error: new Error('down') } : { data: (w.liveBills ?? []).map(p => ({ bill_file_path: p })) }))
      : query(() => ({ data: (w.copies ?? []).map(c => ({ id: c.id, files: c.files })) })),
    storage: { from: () => ({ remove: async (paths: string[]) => { removed.push(paths); return { error: w.removeFails ? new Error('storage down') : null } } }) },
  } as unknown as SupabaseClient
  return { admin, removed }
}
const quiet = async <T>(f: () => Promise<T>) => { const log = console.error; console.error = () => {}; try { return await f() } finally { console.error = log } }

async function main() {
const mine = 'c1/aaa.pdf', other = 'c2/bbb.pdf'

// the shape of a path
assert.ok(isBillFilePath(mine)); assert.ok(!isBillFilePath('c1/../c2/x.pdf')); assert.ok(!isBillFilePath('c1/x.txt')); assert.ok(!isBillFilePath('x.pdf')); assert.ok(!isBillFilePath(42))

// an unused file in the copy's own folder is removed
let f = fake({}); assert.deepEqual(await removeBillFiles(f.admin, 'c1', [mine]), []); assert.deepEqual(f.removed, [[mine]])

// another artist's folder is never touched, whatever the copy says
f = fake({}); await quiet(async () => assert.deepEqual(await removeBillFiles(f.admin, 'c1', [other]), [])); assert.deepEqual(f.removed, [], 'nothing removed')
f = fake({}); await quiet(async () => await removeBillFiles(f.admin, 'c1', ['c1/../c2/x.pdf', 'c1/notes.txt'])); assert.deepEqual(f.removed, [], 'odd paths are ignored')
f = fake({}); await quiet(async () => await removeBillFiles(f.admin, 'c1', [mine, other])); assert.deepEqual(f.removed, [[mine]], 'only the artist\'s own file goes')

// a file a live bill still uses stays
f = fake({ liveBills: [mine] }); assert.deepEqual(await removeBillFiles(f.admin, 'c1', [mine]), []); assert.deepEqual(f.removed, [], 'a live bill uses it')
// a file another kept copy uses stays; the copy's own row does not count against itself
f = fake({ copies: [{ id: 't2', files: [mine] }] }); await removeBillFiles(f.admin, 'c1', [mine], 't1'); assert.deepEqual(f.removed, [], 'another copy keeps it')
f = fake({ copies: [{ id: 't1', files: [mine] }] }); await removeBillFiles(f.admin, 'c1', [mine], 't1'); assert.deepEqual(f.removed, [[mine]], 'its own copy does not hold it back')
// only the unused ones of several go
f = fake({ liveBills: ['c1/used.pdf'] }); await removeBillFiles(f.admin, 'c1', ['c1/used.pdf', 'c1/free.pdf']); assert.deepEqual(f.removed, [['c1/free.pdf']])

// a failed removal is reported so it can be tried again; a lookup that cannot be done removes nothing
f = fake({ removeFails: true }); await quiet(async () => assert.deepEqual(await removeBillFiles(f.admin, 'c1', [mine]), [mine]))
f = fake({ billsLookupFails: true }); await assert.rejects(() => removeBillFiles(f.admin, 'c1', [mine])); assert.deepEqual(f.removed, [], 'if it cannot be checked, nothing is removed')
// nothing to remove: no call at all
f = fake({}); assert.deepEqual(await removeBillFiles(f.admin, 'c1', []), []); assert.deepEqual(f.removed, [])
}

main().then(() => console.log('trash-files checks passed'), e => { console.error(e); process.exit(1) })
