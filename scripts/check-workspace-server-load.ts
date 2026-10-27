// Checks how the daily email job loads a company: every read is scoped to that company, goes a page at a time (the database silently
// cuts a list at 1,000 rows), fails loudly instead of returning a short list, and covers every table the screen's loader covers.
// Run with:  npx tsx scripts/check-workspace-server-load.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fetchAllRows, loadWorkspaceDataServer, PAGE_SIZE } from '../src/lib/workspace-server-load'

let n = 0
const check = async (name: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log('  ok  ' + name) }

type Row = Record<string, unknown>
interface Call { table: string; col: string | null; from: number; to: number; ids: number }
// A pretend database that, like the real one, never returns more than 1,000 rows however many are asked for.
function fakeAdmin(tables: Record<string, Row[]>, failTable?: string) {
  const calls: Call[] = []
  const admin = {
    from(table: string) {
      let inCol: string | null = null, inVals: unknown[] = []
      const orders: { col: string; asc: boolean }[] = []
      const b = {
        select: () => b,
        in: (c: string, v: unknown[]) => { inCol = c; inVals = v; return b },
        order: (col: string, o?: { ascending?: boolean }) => { orders.push({ col, asc: o?.ascending !== false }); return b },
        range: (from: number, to: number) => {
          calls.push({ table, col: inCol, from, to, ids: inVals.length })
          if (failTable === table) return Promise.resolve({ data: null, error: { code: 'X' } })
          let rows = (tables[table] ?? []).filter(r => inCol === null || inVals.includes(r[inCol]))
          for (const o of [...orders].reverse()) rows = [...rows].sort((a, b2) => (String(a[o.col] ?? '') < String(b2[o.col] ?? '') ? -1 : String(a[o.col] ?? '') > String(b2[o.col] ?? '') ? 1 : 0) * (o.asc ? 1 : -1))
          return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + 1000)), error: null })
        },
      }
      return b
    },
  }
  return { admin: admin as never, calls }
}

async function main() {
  await check('a long list is read in full, a page at a time', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: String(i).padStart(5, '0'), g: 'x' }))
    const { admin, calls } = fakeAdmin({ t: rows })
    const got = await fetchAllRows(admin, 't', 'g', ['x'], [{ col: 'id' }])
    assert.equal(got.length, 2500); assert.equal(new Set(got.map(r => r.id)).size, 2500, 'no row twice')
    assert.equal(calls.length, 3); assert.equal(PAGE_SIZE, 1000)
  })
  await check('exactly one full page is followed by one more look (a list of exactly 1,000 is not cut off)', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: String(i).padStart(5, '0'), g: 'x' }))
    const { admin, calls } = fakeAdmin({ t: rows })
    assert.equal((await fetchAllRows(admin, 't', 'g', ['x'], [{ col: 'id' }])).length, 1000); assert.equal(calls.length, 2)
  })
  await check('a long list of ids is asked for in small groups', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`)
    const { admin, calls } = fakeAdmin({ t: ids.map(g => ({ id: g, g })) })
    assert.equal((await fetchAllRows(admin, 't', 'g', ids, [{ col: 'id' }])).length, 250)
    assert.deepEqual(calls.map(c => c.ids), [100, 100, 50])
  })
  await check('no ids means nothing is asked for (never "all rows")', async () => {
    const { admin, calls } = fakeAdmin({ t: [{ id: '1', g: 'x' }] })
    assert.deepEqual(await fetchAllRows(admin, 't', 'g', [], [{ col: 'id' }]), []); assert.equal(calls.length, 0)
  })
  await check('a failed read throws instead of handing back a short list', async () => {
    const { admin } = fakeAdmin({ t: [{ id: '1', g: 'x' }] }, 't')
    await assert.rejects(fetchAllRows(admin, 't', 'g', ['x'], [{ col: 'id' }]))
  })

  // ── a whole company ──
  const client = (id: string, ws: string): Row => ({ id, workspace_id: ws, name: id, genre: '', color: '#000', calendar_token: null, demo_owner: null, setup_skipped: [], analytics: null, photo_path: null, logo_path: null })
  const world = (): Record<string, Row[]> => ({
    clients: [client('a1', 'w1'), client('b1', 'w2')],
    albums: [{ id: 'al1', client_id: 'a1', title: 'A', type: 'album', status: 'draft', release_date: null, cover_url: null }, { id: 'al2', client_id: 'b1', title: 'B' }],
    tracks: [{ id: 'tr1', album_id: 'al1', title: 'T' }, { id: 'tr2', album_id: 'al2', title: 'Other' }],
    invoices: [{ id: 'inv1', client_id: 'a1', number: 'I1', to_name: 'P', category: 'touring', status: 'sent', issued_date: '2026-09-01', due_date: '2026-10-01', currency: 'USD' }, { id: 'inv2', client_id: 'b1', number: 'I2', to_name: 'Q', category: 'touring', status: 'sent', issued_date: '2026-09-01', due_date: '2026-10-01', currency: 'USD' }],
    // 2,500 lines on the OTHER company's invoice, three on ours: a read that is not scoped would never reach ours.
    invoice_line_items: [...Array.from({ length: 2500 }, (_, i) => ({ id: `o${String(i).padStart(5, '0')}`, invoice_id: 'inv2', description: 'x', quantity: 1, rate: 1, sort_order: i })), ...[0, 1, 2].map(i => ({ id: `m${i}`, invoice_id: 'inv1', description: `line ${i}`, quantity: 1, rate: 100, sort_order: i }))],
    shows: [{ id: 's1', client_id: 'a1', date: '2026-10-20', city: 'C', venue: 'V', time: '20:00', status: 'confirmed' }],
    show_advances: [{ id: 'ad1', show_id: 's1', status: 'draft' }, { id: 'ad2', show_id: 'other', status: 'draft' }],
    advance_contacts: [{ id: 'ac1', advance_id: 'ad1', role: 'r', name: 'n' }],
    expenses: [{ id: 'e1', client_id: 'a1', description: 'd', vendor: 'v', amount: 5, currency: 'USD', category: 'other', date: '2026-10-01', paid: false }],
    expense_shows: [{ id: 'es1', expense_id: 'e1', show_id: 's1' }],
    settlements: [{ id: 'st1', client_id: 'a1', currency: 'USD', total_due: 1, payments: [], prepared_on: '2026-10-01' }],
    settlement_shows: [{ settlement_id: 'st1', show_id: 's1' }],
    travel_items: [{ id: 'ti1', client_id: 'a1', kind: 'flight', status: 'booked' }],
    flight_legs: [{ id: 'fl1', travel_item_id: 'ti1', leg_order: 0 }],
    travel_item_shows: [{ id: 'tis1', travel_item_id: 'ti1', show_id: 's1' }],
    track_rounds: [{ id: 'ro1', track_id: 'tr1', label: 'r', stage: 's', created_at: '2026-01-01', sort_order: 0 }],
    track_credits: [{ id: 'cr1', track_id: 'tr1', name: 'n', role: 'r', split: 50, sort_order: 0 }],
    track_notes: [{ id: 'no1', round_id: 'ro1', timestamp: 1, author: 'a', text: 't', resolved: false, created_at: '2026-01-01' }],
    track_note_replies: [{ id: 'nr1', note_id: 'no1', author: 'a', text: 't', created_at: '2026-01-01' }],
  })

  await check('only that company is returned, and a long table of another company does not hide this one\'s rows', async () => {
    const { admin } = fakeAdmin(world())
    const { clients } = await loadWorkspaceDataServer('w1', admin)
    assert.deepEqual(clients.map(c => c.id), ['a1'])
    const inv = clients[0].finance.invoices
    assert.deepEqual(inv.map(i => i.id), ['inv1'])
    assert.equal(inv[0].items.length, 3, 'its three lines, found among thousands of another company\'s')
    assert.ok(!JSON.stringify(clients).includes('Other'), 'nothing of the other company')
  })
  await check('another company\'s data is never even requested: every read names its own rows', async () => {
    const { admin, calls } = fakeAdmin(world())
    await loadWorkspaceDataServer('w1', admin)
    assert.ok(calls.length > 20)
    assert.ok(calls.every(c => c.col !== null && c.ids > 0), 'a read with no filter would fetch everyone\'s rows: ' + JSON.stringify(calls.find(c => c.col === null || c.ids === 0)))
    assert.ok(!calls.some(c => c.table === 'invoice_line_items' && c.ids > 1), 'the lines were asked for by this company\'s invoice only')
  })
  await check('a company with no artists asks for nothing else', async () => {
    const { admin, calls } = fakeAdmin({ clients: [] })
    assert.deepEqual((await loadWorkspaceDataServer('w9', admin)).clients, []); assert.equal(calls.length, 1)
  })
  await check('if any read fails the whole load fails (so nobody is emailed from half the picture)', async () => {
    for (const t of ['shows', 'show_deals', 'invoice_line_items', 'track_note_replies']) {
      const w = world()
      w.show_deals = [{ show_id: 's1', client_id: 'a1' }]
      const { admin } = fakeAdmin(w, t)
      await assert.rejects(loadWorkspaceDataServer('w1', admin), () => true, t)
    }
  })
  await check('it reads every table the screen\'s loader reads (so a table added to one cannot be forgotten in the other)', async () => {
    const src = readFileSync(new URL('../src/lib/db.ts', import.meta.url), 'utf8')
    const a = src.indexOf('export async function loadWorkspaceData'), b = src.indexOf('return assembleWorkspace(', a)
    const screen = new Set([...src.slice(a, b).matchAll(/\.from\('([a-z_]+)'\)/g)].map(m => m[1]))
    const w = world(); w.show_deals = [{ show_id: 's1', client_id: 'a1' }]
    const { admin, calls } = fakeAdmin(w)
    await loadWorkspaceDataServer('w1', admin)
    const server = new Set(calls.map(c => c.table))
    assert.deepEqual([...screen].filter(t => !server.has(t)).sort(), [], 'tables the screen reads that the server does not')
    assert.deepEqual([...server].filter(t => !screen.has(t)).sort(), [], 'tables the server reads that the screen does not')
  })

  console.log(`${n} checks passed`)
}
main().catch(e => { console.error(e); process.exit(1) })
