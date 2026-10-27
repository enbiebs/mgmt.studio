// Checks the daily email job end to end against a pretend database and a pretend mail service: who is emailed, that nothing is sent twice,
// that a failed send is tried again, that emails to outside people are limited in every way that matters, and that with email switched off
// nothing happens.  Run with:  npx tsx scripts/check-daily-email.ts
import assert from 'node:assert/strict'
import {
  runDailyEmails, MAX_SENDS, MAX_CONTRACT_SENDS, MAX_CONTRACT_PER_COMPANY, MAX_CONTRACT_PER_ADDRESS_WEEK, STOP_AFTER_FAILURES, LOG_KEEP_DAYS, type Deps,
} from '../src/lib/daily-email-server'
import { REMINDER_SUBJECT } from '../src/lib/contract-reminders'
import type { Email } from '../src/lib/email'
import type { Client, Contract, Invoice, Task } from '../src/types'

const NOW = new Date('2026-10-26T13:00:00Z')
let n = 0
const check = async (name: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log('  ok  ' + name) }

type Row = Record<string, unknown>
interface World { tables: Record<string, Row[]>; users: Record<string, Row>; reads: number; insertError?: { code: string }; failTable?: string; calls: { table: string; ids: number }[] }

// A pretend database. Like the real one it never answers more than 1,000 rows to one request.
function fakeAdmin(w: World): Deps['admin'] {
  const from = (name: string) => {
    const filters: ((r: Row) => boolean)[] = []
    let ids = 0, cap = Infinity
    const orders: { col: string; asc: boolean }[] = []
    const rowsNow = () => {
      let rows = (w.tables[name] ?? []).filter(r => filters.every(f => f(r)))
      for (const o of [...orders].reverse()) rows = [...rows].sort((a, b) => (String(a[o.col] ?? '') < String(b[o.col] ?? '') ? -1 : String(a[o.col] ?? '') > String(b[o.col] ?? '') ? 1 : 0) * (o.asc ? 1 : -1))
      return rows
    }
    const b = {
      select: () => b,
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return b },
      is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return b },
      in: (c: string, vs: unknown[]) => { ids = vs.length; filters.push(r => vs.includes(r[c])); return b },
      order: (col: string, o?: { ascending?: boolean }) => { orders.push({ col, asc: o?.ascending !== false }); return b },
      limit: (k: number) => { cap = k; return b },
      range: (from: number, to: number) => {
        w.reads++; w.calls.push({ table: name, ids })
        if (w.failTable === name) return Promise.resolve({ data: null, error: { code: 'X' } })
        return Promise.resolve({ data: rowsNow().slice(from, Math.min(to + 1, from + 1000)), error: null })
      },
      insert: async (row: Row) => {
        if (w.insertError) return { error: w.insertError }
        const t = (w.tables[name] ??= [])
        if (name === 'email_log' && t.some(r => r.key === row.key)) return { error: { code: '23505' } }
        t.push({ sent_at: NOW.toISOString(), ...row }); return { error: null }
      },
      delete: () => ({
        eq: async (c: string, v: unknown) => { w.tables[name] = (w.tables[name] ?? []).filter(r => r[c] !== v); return { error: null } },
        lt: async (c: string, v: string) => { w.tables[name] = (w.tables[name] ?? []).filter(r => !(String(r[c]) < v)); return { error: null } },
      }),
      then: (resolve: (v: unknown) => unknown) => {
        w.reads++
        if (w.failTable === name) return resolve({ data: null, error: { code: 'X' } })
        return resolve({ data: rowsNow().slice(0, cap), error: null })
      },
    }
    return b
  }
  return { from, auth: { admin: { getUserById: async (id: string) => ({ data: { user: w.users[id] ?? null } }) } } } as unknown as Deps['admin']
}

const invoice = (id: string): Invoice => ({ id, number: id, to: 'Promoter', category: 'touring', status: 'sent', issuedDate: '2026-09-01', dueDate: '2026-10-01', items: [{ description: 'x', quantity: 1, rate: 3000 }], currency: 'USD' } as Invoice)
const contract = (id: string, emails: string[]): Contract => ({ id, title: 'Publishing deal', type: 'publishing', status: 'signed', counterparty: 'Kobalt', autoRenews: true, noticeDays: 60, expiryDate: '2027-01-05', createdAt: '2026-01-01', reminderEmails: emails } as Contract)
const task = (id: string, o: Partial<Task>): Task => ({ id, title: 'Call the venue', source: 'manual', createdAt: '2026-10-26T08:00:00Z', ...o } as Task)
const artist = (id: string, name: string, o: { contracts?: Contract[]; tasks?: Task[]; isDemo?: boolean } = {}) => ({
  id, name, isDemo: o.isDemo, tour: { shows: [], advances: [], guestList: [], offerSheets: [], travel: [] }, songs: { albums: [] }, content: { posts: [] }, projects: [],
  legal: { contracts: o.contracts ?? [] }, finance: { invoices: [invoice('inv1')], expenses: [], vendors: [], budgets: [], crewRates: [], settlements: [] },
  agentData: { offers: [] }, business: { banking: { deposits: [] } }, tasks: o.tasks ?? [],
} as unknown as Client)
const A = artist('a1', 'Mascolo', { contracts: [contract('k1', ['lawyer@firm.com'])] })

const signedIn = { last_sign_in_at: '2026-10-25T00:00:00Z', email_confirmed_at: '2026-01-01T00:00:00Z' }
function world(): World {
  return {
    reads: 0, calls: [],
    tables: {
      workspaces: [{ id: 'w1', name: 'Noted Management' }],
      workspace_members: [
        { id: 'm1', user_id: 'u1', role: 'manager', workspace_id: 'w1', client_id: null },
        { id: 'm2', user_id: 'u2', role: 'team', workspace_id: 'w1', client_id: null },
        { id: 'm3', user_id: 'u3', role: 'team', workspace_id: 'w1', client_id: null },
        { id: 'm4', user_id: 'u4', role: 'manager', workspace_id: 'w1', client_id: null },
        { id: 'm5', user_id: 'u5', role: 'manager', workspace_id: 'w1', client_id: null },
        { id: 'm6', user_id: 'u6', role: 'artist', workspace_id: 'w1', client_id: 'a1' },     // the artist's own login: never part of the team list
      ],
      access_grants: [{ id: 'g1', workspace_member_id: 'm2', section: 'finance', client_id: 'a1', can_edit: false }, { id: 'g2', workspace_member_id: 'm3', section: 'tour', client_id: 'a1', can_edit: false }],
      item_access: [], inbox_state: [], email_suppressions: [], email_log: [],
      email_prefs: [{ user_id: 'u5', morning_email: false }],
    },
    users: {
      u1: { email: 'Eli@Noted.com', ...signedIn }, u2: { email: 'sam@noted.com', ...signedIn }, u3: { email: 'kim@noted.com', ...signedIn },
      u4: { email: 'new@noted.com', last_sign_in_at: null, email_confirmed_at: null }, u5: { email: 'quiet@noted.com', ...signedIn }, u6: { email: 'artist@x.com', ...signedIn },
    },
  }
}

const ON = { RESEND_API_KEY: 'k', EMAIL_FROM: 'Mgmt Path <n@example.com>', CONTRACT_REMINDERS_ON: '1', SUPABASE_SERVICE_ROLE_KEY: 'server-secret' }
type Env = Record<string, string | undefined>

async function run(w: World, o: { dryRun?: boolean; send?: Deps['send']; clients?: Client[]; env?: Env; now?: Date } = {}) {
  const sent: Email[] = []
  const send: Deps['send'] = o.send ? async m => { const r = await o.send!(m); if (r.ok) sent.push(m); return r } : async m => { sent.push(m); return { ok: true } }
  const s = await runDailyEmails({ dryRun: o.dryRun, now: o.now ?? NOW }, { admin: fakeAdmin(w), load: async () => ({ clients: o.clients ?? [A] }), send }, o.env ?? ON)
  return { s, sent }
}
const to = (sent: Email[], a: string) => sent.find(m => m.to === a)!
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

async function main() {
  await check('with email switched off, nothing is read and nothing is sent', async () => {
    const w = world()
    const { s, sent } = await run(w, { env: {} })
    assert.equal(s.emailOn, false); assert.equal(sent.length, 0); assert.equal(w.reads, 0); assert.equal(w.tables.email_log.length, 0)
  })

  await check('a dry run counts what would go out and sends and records nothing', async () => {
    const w = world()
    const { s, sent } = await run(w, { dryRun: true })
    assert.equal(sent.length, 0); assert.equal(w.tables.email_log.length, 0)
    assert.deepEqual([s.morning.due, s.contracts.due, s.morning.sent, s.contracts.sent, s.logReady], [2, 1, 0, 0, true])      // the manager and the one with Finance; the lawyer
    assert.deepEqual(s.morning.skipped, { 'nothing-today': 1, 'no-login-yet': 1, 'switched-off': 1 })
  })
  await check('a dry run works before email is set up, so the content can be seen first; it also says whether the log is ready', async () => {
    const { s } = await run(world(), { dryRun: true, env: {} })
    assert.equal(s.emailOn, false); assert.equal(s.morning.due, 2); assert.equal(s.contracts.due, 1)
    const w = world(); w.failTable = 'email_log'
    assert.equal((await run(w, { dryRun: true })).s.logReady, false, 'before the migration is applied a real run would send nothing, and the dry run says so')
  })

  await check('a real run emails the right people the right things, and records each', async () => {
    const w = world()
    const { s, sent } = await run(w)
    assert.deepEqual([s.morning.sent, s.contracts.sent], [2, 1])
    assert.equal(w.tables.email_log.length, 3)
    assert.ok(to(sent, 'lawyer@firm.com') && to(sent, 'eli@noted.com') && to(sent, 'sam@noted.com'))
    assert.ok(!sent.some(m => ['kim@noted.com', 'new@noted.com', 'quiet@noted.com', 'artist@x.com'].includes(m.to)), 'nobody else gets one')
    assert.match(to(sent, 'sam@noted.com').text, /overdue/i); assert.ok(!to(sent, 'sam@noted.com').text.includes('Publishing deal'), 'the person with only Finance hears about money, not the contract')
    assert.match(to(sent, 'eli@noted.com').text, /Publishing deal/)
    assert.match(to(sent, 'sam@noted.com').text, /Noted Management/)
    // the outside lawyer: the fixed subject, the stop link, and nothing about the money
    const l = to(sent, 'lawyer@firm.com')
    assert.equal(l.subject, REMINDER_SUBJECT); assert.match(l.unsubscribeUrl!, /^https:\/\/www\.mgmtpath\.com\/api\/email\/unsubscribe\?a=lawyer%40firm\.com&t=[0-9a-f]{64}$/)
    assert.ok(!l.text.includes('overdue') && !l.text.includes('3,000'))
    assert.ok(sent.every(m => m.key), 'every email carries its once-only key')
    assert.equal(w.tables.email_log.find(r => r.kind === 'contract')!.recipient, 'lawyer@firm.com')
  })
  await check('running it again the same day sends nothing more', async () => {
    const w = world()
    await run(w)
    const { s, sent } = await run(w)
    assert.equal(sent.length, 0); assert.equal(w.tables.email_log.length, 3)
    assert.equal(s.morning.skipped.already, 2); assert.equal(s.contracts.skipped.already, 1)
  })
  await check('the next day the morning email comes again, but the reminder already sent does not', async () => {
    const w = world()
    await run(w)
    const { s } = await run(w, { now: new Date('2026-10-27T13:00:00Z') })
    assert.equal(s.morning.sent, 2); assert.equal(s.contracts.sent, 0); assert.equal(s.contracts.skipped.already, 1)
  })
  await check('a send that fails is forgotten, so the next run tries again', async () => {
    const w = world()
    const { s } = await run(w, { send: async () => ({ ok: false, reason: 'failed' }) })
    assert.equal(s.morning.sent, 0); assert.equal(s.morning.skipped.failed, 2); assert.equal(w.tables.email_log.length, 0)
    assert.equal((await run(w)).s.morning.sent, 2)
  })
  await check('if it cannot be recorded, it is not sent', async () => {
    const w = world(); w.insertError = { code: '42P01' }
    const { s, sent } = await run(w)
    assert.equal(sent.length, 0); assert.equal(s.morning.skipped.failed, 2); assert.equal(s.contracts.skipped.failed, 1)
  })
  await check('if the access rules cannot be read, that company is skipped altogether (nobody emailed, nobody outside either)', async () => {
    for (const table of ['access_grants', 'item_access', 'inbox_state', 'email_prefs']) {
      const w = world(); w.failTable = table
      const { s, sent } = await run(w)
      assert.equal(sent.length, 0, table); assert.equal(s.morning.due, 0, table)
    }
  })
  await check('a hide that sits beyond the first 1,000 rows is still found (a list is read to the end, not cut off)', async () => {
    const w = world()
    // 1,500 other people's rows come first; the one that matters is last
    for (let i = 0; i < 1500; i++) w.tables.item_access.push({ id: `a${String(i).padStart(5, '0')}`, client_id: 'a1', item_type: 'invoice', item_id: `x${i}`, member_id: 'someone-else', effect: 'hide' })
    w.tables.item_access.push({ id: 'z-last', client_id: 'a1', item_type: 'invoice', item_id: 'inv1', member_id: 'm2', effect: 'hide' })
    const { sent } = await run(w)
    assert.ok(!sent.some(m => m.to === 'sam@noted.com'), 'the invoice stays hidden from the person it is hidden from')
    assert.ok(to(sent, 'eli@noted.com'))
  })
  await check('an invoice hidden from one person is not in their email; what a person marked done is not repeated', async () => {
    const w = world()
    w.tables.item_access.push({ id: 'x1', client_id: 'a1', item_type: 'invoice', item_id: 'inv1', member_id: 'm2', effect: 'hide' })
    w.tables.inbox_state.push({ user_id: 'u1', item_key: 'invoice:a1:inv1:urgent', state: 'done', until: null })
    const { sent } = await run(w)
    assert.ok(!sent.some(m => m.to === 'sam@noted.com'))
    assert.ok(!/overdue/i.test(to(sent, 'eli@noted.com').text), 'Eli marked it done')
    assert.match(to(sent, 'eli@noted.com').text, /Publishing deal/)
  })
  await check('a person who is banned, or has not confirmed their address, is not emailed', async () => {
    const w = world()
    w.users.u2 = { ...w.users.u2, banned_until: '2099-01-01T00:00:00Z' }
    w.users.u1 = { ...w.users.u1, email_confirmed_at: null }
    assert.equal((await run(w)).s.morning.sent, 0)
    const quiet = world()
    quiet.users.u1 = { ...quiet.users.u1, last_sign_in_at: null }          // confirmed, but has never signed in
    assert.equal((await run(quiet)).s.morning.sent, 1, 'only the one who has signed in')
  })
  await check('a try-out list limits who gets mail, and the rest are not recorded as sent', async () => {
    const w = world()
    const { s, sent } = await run(w, { env: { ...ON, EMAIL_ONLY_TO: 'eli@noted.com' } })
    assert.deepEqual(sent.map(m => m.to), ['eli@noted.com'])
    assert.equal(s.morning.skipped['not-allowed'], 1); assert.equal(s.contracts.skipped['not-allowed'], 1)
    assert.equal(w.tables.email_log.length, 1)
  })
  await check('practice artists are never emailed about', async () => {
    const { s, sent } = await run(world(), { clients: [{ ...A, isDemo: true } as Client] })
    assert.equal(sent.length, 0); assert.equal(s.morning.due + s.contracts.due, 0)
  })

  // ── to-dos given to someone are announced once ──
  await check('a to-do given to someone is announced once, and the next morning does not say it again', async () => {
    const w = world()
    const mine = artist('a1', 'Mascolo', { tasks: [task('t1', { assigneeId: 'u2', createdBy: 'u1', title: 'Send the W9' })] })
    const first = await run(w, { clients: [mine] })
    assert.match(to(first.sent, 'sam@noted.com').text, /Given to you: Send the W9/)
    assert.ok(w.tables.email_log.some(r => r.key === 'todo:u2:t1' && r.kind === 'todo'))
    const second = await run(w, { clients: [mine], now: new Date('2026-10-27T13:00:00Z') })
    assert.ok(!/Given to you/.test(to(second.sent, 'sam@noted.com').text), 'not announced twice')
    assert.match(to(second.sent, 'sam@noted.com').text, /overdue/i, 'but the rest of the morning email is still there')
  })

  // ── emails to outside people ──
  await check('reminders to outside people are a second switch: off, they are counted and not sent', async () => {
    const { s, sent } = await run(world(), { env: { ...ON, CONTRACT_REMINDERS_ON: undefined } })
    assert.equal(sent.some(m => m.to === 'lawyer@firm.com'), false); assert.equal(s.contracts.skipped['not-turned-on'], 1); assert.equal(s.morning.sent, 2, 'the team\'s morning email is not affected')
  })
  await check('without a server secret there is no stop link, so nothing goes to outside people', async () => {
    const { s, sent } = await run(world(), { env: { ...ON, SUPABASE_SERVICE_ROLE_KEY: undefined } })
    assert.equal(sent.some(m => m.to === 'lawyer@firm.com'), false); assert.equal(s.contracts.skipped['no-stop-link'], 1)
  })
  await check('somebody who used the stop link is never emailed again', async () => {
    const w = world(); w.tables.email_suppressions.push({ address: 'lawyer@firm.com' })
    const { s, sent } = await run(w)
    assert.equal(sent.some(m => m.to === 'lawyer@firm.com'), false); assert.equal(s.contracts.skipped['stopped-by-them'], 1)
  })
  await check('one outside address gets only a few emails a week, whoever asked for them', async () => {
    const w = world()
    for (let i = 0; i < MAX_CONTRACT_PER_ADDRESS_WEEK; i++) w.tables.email_log.push({ key: `contract:other${i}:d:30:lawyer@firm.com`, kind: 'contract', recipient: 'lawyer@firm.com', sent_at: ago(2) })
    assert.equal((await run(w)).s.contracts.skipped['too-many-this-week'], 1)
    const old = world()
    for (let i = 0; i < MAX_CONTRACT_PER_ADDRESS_WEEK; i++) old.tables.email_log.push({ key: `contract:other${i}:d:30:lawyer@firm.com`, kind: 'contract', recipient: 'lawyer@firm.com', sent_at: ago(10) })
    assert.equal((await run(old)).s.contracts.sent, 1, 'emails from more than a week ago do not count')
  })
  await check('one company cannot send more than its share in a run', async () => {
    const w = world()
    const many = artist('a1', 'Mascolo', { contracts: Array.from({ length: MAX_CONTRACT_PER_COMPANY + 10 }, (_, i) => contract(`k${i}`, [`p${i}@firm.com`])) })
    const { s, sent } = await run(w, { clients: [many] })
    assert.equal(sent.filter(m => m.subject === REMINDER_SUBJECT).length, MAX_CONTRACT_PER_COMPANY)
    assert.equal(s.contracts.skipped['company-limit'], 10)
  })
  await check('and there is a ceiling on all outside reminders in a run, kept apart from the team\'s emails', async () => {
    const w = world()
    w.tables.workspaces = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, name: `Co ${i}` }))
    w.tables.workspace_members = w.tables.workspaces.map((ws, i) => ({ id: `m${i}`, user_id: `u1`, role: 'manager', workspace_id: ws.id as string, client_id: null }))
    let call = 0
    const s = await runDailyEmails({ now: NOW }, { admin: fakeAdmin(w), load: async () => { const k = call++; return { clients: [artist('a1', 'Mascolo', { contracts: Array.from({ length: MAX_CONTRACT_PER_COMPANY }, (_, i) => contract(`k${k}-${i}`, [`p${k}x${i}@firm.com`])) })] } }, send: async () => ({ ok: true }) }, ON)
    assert.equal(s.contracts.sent, MAX_CONTRACT_SENDS); assert.ok((s.contracts.skipped.limit ?? 0) > 0)
    assert.equal(s.morning.sent, 6, 'every company\'s morning emails still went')
  })
  await check('the morning emails have a ceiling too', async () => {
    const w = world()
    for (let i = 0; i < MAX_SENDS + 20; i++) {
      w.tables.workspace_members.push({ id: `x${i}`, user_id: `ux${i}`, role: 'manager', workspace_id: 'w1', client_id: null })
      w.users[`ux${i}`] = { email: `p${i}@noted.com`, ...signedIn }
    }
    const { s } = await run(w)
    assert.equal(s.morning.sent, MAX_SENDS); assert.ok((s.morning.skipped.limit ?? 0) > 0)
  })
  await check('after a run of failures in a row it stops, instead of hammering a broken service', async () => {
    const w = world()
    for (let i = 0; i < 20; i++) { w.tables.workspace_members.push({ id: `x${i}`, user_id: `ux${i}`, role: 'manager', workspace_id: 'w1', client_id: null }); w.users[`ux${i}`] = { email: `p${i}@noted.com`, ...signedIn } }
    let tries = 0
    const { s } = await run(w, { send: async () => { tries++; return { ok: false, reason: 'failed' } } })
    assert.equal(tries, STOP_AFTER_FAILURES); assert.ok((s.morning.skipped.stopped ?? 0) > 0)
    assert.equal(w.tables.email_log.length, 0, 'nothing is left recorded as sent')
  })

  await check('a person in two companies gets one email from each, each about its own company', async () => {
    const w = world()
    w.tables.workspaces = [{ id: 'w1', name: 'Noted Management' }, { id: 'w2', name: 'Other Co' }]
    w.tables.workspace_members = [{ id: 'm1', user_id: 'u1', role: 'manager', workspace_id: 'w1', client_id: null }, { id: 'm9', user_id: 'u1', role: 'manager', workspace_id: 'w2', client_id: null }]
    const byWs: Record<string, Client> = { w1: artist('a1', 'Mascolo'), w2: artist('b1', 'Zebra') }
    const sent: Email[] = []
    await runDailyEmails({ now: NOW }, { admin: fakeAdmin(w), load: async id => ({ clients: [byWs[id]] }), send: async m => { sent.push(m); return { ok: true } } }, ON)
    assert.equal(sent.length, 2)
    const one = sent.find(m => m.text.includes('Mascolo'))!, two = sent.find(m => m.text.includes('Zebra'))!
    assert.ok(!one.text.includes('Zebra') && !two.text.includes('Mascolo')); assert.match(one.text, /Noted Management/); assert.match(two.text, /Other Co/)
  })

  await check('old log rows are tidied away, recent ones kept, and a dry run tidies nothing', async () => {
    const w = world()
    w.tables.email_log.push({ key: 'old', kind: 'morning', recipient: null, sent_at: ago(LOG_KEEP_DAYS + 5) }, { key: 'recent', kind: 'morning', recipient: null, sent_at: ago(30) })
    await run(w, { dryRun: true })
    assert.ok(w.tables.email_log.some(r => r.key === 'old'))
    await run(w)
    assert.ok(!w.tables.email_log.some(r => r.key === 'old')); assert.ok(w.tables.email_log.some(r => r.key === 'recent'))
  })

  await check('the answer never contains an address, a name or a title', async () => {
    const { s } = await run(world())
    const text = JSON.stringify(s)
    for (const secret of ['noted.com', 'firm.com', 'Mascolo', 'Publishing', 'Eli', 'server-secret']) assert.ok(!text.includes(secret), secret)
  })

  console.log(`${n} checks passed`)
}
main().catch(e => { console.error(e); process.exit(1) })
