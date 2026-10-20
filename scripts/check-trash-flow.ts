// Checks what a delete through the trash tells the person for each way it can end, and how the database's answers are read: nothing is
// deleted without a copy (the database does both in one step), no permission is said plainly, and an old database without the trash
// still lets deletes work as before.  Run with:  npx tsx scripts/check-trash-flow.ts
import assert from 'node:assert/strict'
import { rpcErrorCode, tableErrorCode, trashAndDelete, type TrashDeps } from '../src/lib/trash-flow'

const quiet = <T>(f: () => Promise<T>) => { const log = console.error, warn = console.warn; console.error = () => {}; console.warn = () => {}; return f().finally(() => { console.error = log; console.warn = warn }) }

function world(trashDelete: TrashDeps['trashDelete'], legacy: () => Promise<unknown> = async () => {}) {
  const calls: string[] = []
  const deps: TrashDeps = { trashDelete: async a => { calls.push(`trashDelete:${a.kind}:${a.id}:${a.label}`); return trashDelete(a) } }
  const run = () => trashAndDelete(deps, { kind: 'invoice', id: 'inv1', label: 'INV-1002', runLegacyDelete: async () => { calls.push('legacy'); return legacy() } })
  return { calls, run }
}
const coded = (code: string) => Object.assign(new Error('boom'), { code })

async function main() {
// the normal way: one call keeps the copy and deletes; the old direct delete is not used
let w = world(async () => 'trash-1'); let r = await w.run()
assert.deepEqual(r, { ok: true, trashId: 'trash-1' }); assert.deepEqual(w.calls, ['trashDelete:invoice:inv1:INV-1002'], 'one step, no separate delete')

// the item is not in the database yet: nothing to delete and nothing to keep
w = world(async () => null); r = await w.run()
assert.deepEqual(r, { ok: true, trashId: null }); assert.deepEqual(w.calls, ['trashDelete:invoice:inv1:INV-1002'])

// no permission: nothing happens, and the person is told why
w = world(async () => { throw coded('forbidden') }); r = await quiet(w.run)
assert.equal(r.ok, false); assert.match((r as { error: string }).error, /don't have permission/); assert.ok(!w.calls.includes('legacy'), 'and nothing is deleted another way')

// the database failed for any other reason: nothing is deleted, even if the error looks like "does not exist" from inside the function
for (const code of ['42883', '42P01', '23503', undefined]) {
  w = world(async () => { throw coded(code as string) }); r = await quiet(w.run)
  assert.equal(r.ok, false, `code ${code}`); assert.ok(!w.calls.includes('legacy'), `code ${code}: never falls back to deleting without a copy`); assert.match((r as { error: string }).error, /Nothing was changed/)
}

// the trash is not set up yet (code ahead of the database): deleted the way it always was, with no copy
w = world(async () => { throw coded('missing') }); r = await quiet(w.run)
assert.deepEqual(r, { ok: true, trashId: null }); assert.deepEqual(w.calls, ['trashDelete:invoice:inv1:INV-1002', 'legacy'])
w = world(async () => { throw coded('missing') }, async () => { throw new Error('db down') }); r = await quiet(w.run)
assert.equal(r.ok, false, 'and if that fails too, it says so'); assert.match((r as { error: string }).error, /Nothing was changed/)

// what the database's answers mean. Only "no such function" (PostgREST) means the trash is not set up for a function call.
assert.equal(rpcErrorCode({ code: 'PGRST202' }), 'missing', 'PostgREST: no such function')
assert.equal(rpcErrorCode({ code: '42883' }), '42883', 'a function that is missing INSIDE the trash function is a fault, not "not set up"')
assert.equal(rpcErrorCode({ code: '42P01' }), '42P01', 'so is a missing table inside it')
assert.equal(rpcErrorCode({ code: '42501' }), 'forbidden'); assert.equal(rpcErrorCode({ code: '23505' }), '23505'); assert.equal(rpcErrorCode(null), undefined)
// reading the list: the table itself being absent is "not set up"
assert.equal(tableErrorCode({ code: '42P01' }), 'missing'); assert.equal(tableErrorCode({ code: 'PGRST205' }), 'missing'); assert.equal(tableErrorCode({ code: '42501' }), '42501'); assert.equal(tableErrorCode(null), undefined)
}

main().then(() => console.log('trash-flow checks passed'), e => { console.error(e); process.exit(1) })
