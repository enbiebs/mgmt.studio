// Checks the trash plan: how long things are kept, what each kind saves (against what the database really removes with it), the words
// shown to people, and that the database functions in supabase/tests/066_trash.sql are given exactly the description the app has.
// Run with:  npx tsx scripts/check-trash.ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SPECS, TRASH_DAYS, daysLeft, daysLeftText, expiresAt, isExpired, keyOf, kindNoun, restoreByFor, restoreNote, screenSectionOf, sectionOf, sectionsOf, trashSpecJson, type TrashKind, type TrashSection } from '../src/lib/trash'

// ── how long things are kept ──
assert.equal(TRASH_DAYS, 30)
assert.equal(expiresAt('2026-10-20T12:00:00.000Z'), '2026-11-19T12:00:00.000Z', '30 days to the hour')
assert.equal(expiresAt('2026-01-15T00:00:00.000Z'), '2026-02-14T00:00:00.000Z', 'across a month end')
assert.equal(expiresAt('2028-02-10T08:30:00.000Z'), '2028-03-11T08:30:00.000Z', 'across a leap day')
const now = new Date('2026-10-20T12:00:00.000Z')
assert.equal(isExpired('2026-10-20T11:59:59.000Z', now), true); assert.equal(isExpired('2026-10-20T12:00:00.000Z', now), true, 'the moment it expires it is gone')
assert.equal(isExpired('2026-10-20T12:00:01.000Z', now), false)
assert.equal(daysLeft('2026-11-19T12:00:00.000Z', now), 30); assert.equal(daysLeft('2026-10-21T12:00:00.000Z', now), 1)
assert.equal(daysLeft('2026-10-20T13:00:00.000Z', now), 1, 'an hour left still says 1 day, never 0')
assert.equal(daysLeft('2026-10-20T12:00:00.000Z', now), 0); assert.equal(daysLeft('2026-10-01T00:00:00.000Z', now), 0, 'never negative')
assert.equal(daysLeftText(30), '30 days left'); assert.equal(daysLeftText(1), '1 day left'); assert.equal(daysLeftText(0), 'Expires today')

// ── the words ──
const KINDS = ['show', 'offer', 'invoice', 'bill', 'deposit', 'person'] as TrashKind[]
assert.deepEqual(KINDS.map(kindNoun), ['Show', 'Offer', 'Invoice', 'Bill', 'Deposit', 'Person'])
assert.equal(restoreNote('you'), 'You can restore it from the Trash for 30 days.')
assert.equal(restoreNote('you', 'them'), 'You can restore them from the Trash for 30 days.')
assert.equal(restoreNote('manager'), 'A manager can restore it from the Trash for 30 days.', 'someone who cannot see the copy is not promised they can')
assert.equal(restoreNote('nobody'), 'This cannot be undone.', 'no database, no trash')

// ── who may see it ──
// The part of the app that decides who may delete and restore an item, and every part its copy touches (the copy of a show carries fee
// terms and bills; the copy of a person carries crew rates). Only someone who can open ALL of them sees the copy.
assert.deepEqual(KINDS.map(sectionOf), ['tour', 'deals', 'finance', 'finance', 'finance', 'team'])
for (const k of KINDS) assert.ok(sectionsOf(k).includes(sectionOf(k)), `${k}: its own part of the app is one of the parts it touches`)
// Every part named must be one the database knows how to grant (the access_grants.section check, read from the live database on 2026-10-20),
// or nobody but the owner could ever see the copy.
const GRANTABLE = ['music', 'tour', 'content', 'finance', 'team', 'projects', 'analytics', 'fandom', 'legal', 'profile', 'vault', 'admin', 'deals']
for (const k of KINDS) for (const s of sectionsOf(k)) assert.ok(GRANTABLE.includes(s), `${k}: "${s}" is not a part of the app that can be granted`)

// ── who could put it back, for one person ──
const person = (held: TrashSection[], edited: TrashSection[] = held) => ({ holds: (s: TrashSection) => held.includes(s), edits: (s: TrashSection) => edited.includes(s) })
const ALL: TrashSection[] = ['tour', 'deals', 'finance', 'team', 'music']
for (const k of KINDS) assert.equal(restoreByFor(k, true, person(ALL)), 'you', `${k}: someone who holds every part and can edit can put it back`)
for (const k of KINDS) assert.equal(restoreByFor(k, false, person(ALL)), 'nobody', `${k}: no database, no trash`)
assert.equal(restoreByFor('invoice', true, person(['finance'])), 'manager', 'an invoice copy carries Deals & fees data: Finance alone cannot see it')
assert.equal(restoreByFor('invoice', true, person(['finance', 'deals'])), 'you')
assert.equal(restoreByFor('deposit', true, person(['finance'])), 'you', 'a deposit touches only Finance')
assert.equal(restoreByFor('deposit', true, person(['finance'], [])), 'manager', 'looking is not enough: putting it back needs edit access')
assert.equal(restoreByFor('show', true, person(['tour', 'deals'])), 'manager', 'a show copy carries fee terms and bills')
assert.equal(restoreByFor('person', true, person(['team', 'tour', 'finance'])), 'manager', 'a person copy carries crew rates and release contacts (the songs part, called music in the database)')
assert.equal(restoreByFor('person', true, person(['team', 'tour', 'finance', 'music'])), 'you')
assert.equal(restoreByFor('bill', true, person(['finance'])), 'manager', 'a bill copy carries its show links')
// the screens call the songs part 'songs'
assert.equal(screenSectionOf('music'), 'songs'); assert.deepEqual((['tour', 'deals', 'finance', 'team'] as TrashSection[]).map(screenSectionOf), ['tour', 'deals', 'finance', 'team'])

// ── a restored link is dropped if the other side has been given to something else (the two sides must not disagree) ──
assert.deepEqual(SPECS.show.rootNeeds.find(n => n.column === 'tour_offer_id')?.takenBy, 'show_id')
assert.deepEqual(SPECS.offer.rootNeeds.find(n => n.column === 'show_id')?.takenBy, 'tour_offer_id')

// ── what each kind saves, against what the database removes with it (read from the live foreign keys on 2026-10-20) ──
// cascade = rows the database deletes along with the item; unlink = rows it only clears a link on.
// (The live database is checked against SPECS again every time the trash is tested: section 8 of supabase/tests/066_trash_test.sql.)
const DATABASE: Record<TrashKind, { cascade: string[]; unlink: string[] }> = {
  show: { cascade: ['show_advances', 'advance_contacts', 'guest_list_entries', 'show_deals', 'travel_items', 'flight_legs', 'travel_item_shows', 'settlement_shows', 'expense_shows'], unlink: ['budgets.show_id', 'tour_offers.show_id'] },
  offer: { cascade: ['budgets', 'offer_sheets'], unlink: ['shows.tour_offer_id', 'budgets.offer_id'] },
  invoice: { cascade: ['invoice_line_items'], unlink: ['deposits.invoice_id', 'show_deals.invoice_id', 'bank_transactions.invoice_id'] },
  bill: { cascade: ['expense_shows'], unlink: [] },
  deposit: { cascade: [], unlink: [] },
  person: { cascade: ['crew_members', 'crew_rates', 'release_stakeholders'], unlink: ['workspace_members.person_id', 'pending_invites.person_id'] },
}
for (const [kind, spec] of Object.entries(SPECS) as [TrashKind, typeof SPECS[TrashKind]][]) {
  assert.deepEqual(spec.children.map(c => c.table).sort(), [...DATABASE[kind].cascade].sort(), `${kind}: saves every row the database deletes with it, and nothing else`)
  assert.deepEqual(spec.relinks.map(r => `${r.table}.${r.column}`).sort(), [...DATABASE[kind].unlink].sort(), `${kind}: remembers every link the database clears`)
  // every table is put back after the tables it is found through, and each is listed once
  const seen = ['root']
  for (const c of spec.children) {
    for (const by of Array.isArray(c.by) ? c.by : [c.by]) assert.ok(seen.includes(by.from), `${kind}: ${c.table} is found through ${by.from}, which comes before it`)
    seen.push(c.table)
  }
  assert.equal(new Set(spec.children.map(c => c.table)).size, spec.children.length, `${kind}: no table twice`)
  assert.ok(spec.children.every(c => (c.needs ?? []).every(n => n.table !== c.table)), `${kind}: no table needs itself`)
}
assert.equal(SPECS.bill.fileColumn, 'bill_file_path', 'a bill keeps its PDF until it expires')
assert.equal(keyOf('show_deals'), 'show_id'); assert.equal(keyOf('crew_rates'), 'crew_member_id'); assert.equal(keyOf('invoices'), 'id')
// a budget that became a show's budget outlives its offer, so it is relinked, not saved as a row to re-insert
assert.deepEqual(SPECS.offer.children.find(c => c.table === 'budgets')?.filter, { column: 'show_id', isNull: true })
assert.deepEqual(SPECS.offer.relinks.find(r => r.table === 'budgets')?.filter, { column: 'show_id', isNull: false })

// ── the database functions are given exactly this description ──
const spec = JSON.stringify(trashSpecJson())
const apply = readFileSync('supabase/tests/066_trash.sql', 'utf8')
const header = apply.match(/^-- SPEC-JSON: (.*)$/m)?.[1]
assert.ok(header, '066_trash.sql carries the description on a "-- SPEC-JSON:" line')
assert.equal(header, spec, '066_trash.sql: the "-- SPEC-JSON:" line is what src/lib/trash.ts says. Re-run: npx tsx scripts/print-trash-spec.ts')
const inFunction = apply.match(/create function public\.trash_spec\(\)[^$]*\$fn\$\s*select '(.*)'::jsonb\s*\$fn\$/)?.[1]
assert.ok(inFunction, '066_trash.sql: trash_spec() holds the description')
assert.equal(inFunction, spec, '066_trash.sql: trash_spec() is what src/lib/trash.ts says')
assert.ok(!spec.includes("'"), 'the description has no quote that would break the SQL string')

// ...and the file that tests it applies exactly that file (inside a transaction that is rolled back)
const test = readFileSync('supabase/tests/066_trash_test.sql', 'utf8')
const between = test.match(/execute \$apply\$\n([\s\S]*?)\n\s*\$apply\$;/)?.[1]
assert.ok(between, '066_trash_test.sql embeds the file between two $apply$ markers')
assert.equal(between.trim(), apply.trim(), '066_trash_test.sql tests exactly what 066_trash.sql applies')
assert.match(test, /ALL 066 CHECKS PASSED \(rolled back\)/, 'the test ends in its intentional rollback')

// ── nothing in the apply file lets a person write to the trash directly ──
assert.match(apply, /revoke all on public\.trash_items from anon, authenticated;/, 'direct rights are removed')
assert.match(apply, /grant select on public\.trash_items to authenticated;/, 'looking is allowed (the row policy decides what)')
assert.ok(!/create policy[^;]*for (insert|update|delete|all)/i.test(apply), 'no policy lets anyone but the functions write')
// what a copy holds is not readable by the app at all, and who can see a copy is decided by one function
assert.match(apply, /alter table public\.trash_contents enable row level security;\nrevoke all on public\.trash_contents from anon, authenticated;/, 'what a copy holds: row security on, no rights, no policy')
assert.ok(!/create policy[^;]*on public\.trash_contents/i.test(apply), 'and no policy on it')
assert.match(apply, /create policy "trash select" on public\.trash_items for select using \(public\.trash_can_see\(id\)\);/, 'the list is decided by trash_can_see')
// every function has fixed rules and an empty search path (each checked inside its OWN text, not the next function's), and is closed to the public;
// the inner steps are closed to the app as well
const functions = apply.split(/(?=^create function public\.)/m).filter(c => c.startsWith('create function public.'))
const fnName = (c: string) => c.match(/^create function public\.(\w+)\(/)![1]
const OPEN_TO_APP = ['trash_can_see', 'trash_delete', 'trash_restore', 'trash_discard']          // what the app may call
const INNER = ['trash_spec', 'trash_row_columns', 'trash_take', 'trash_check_spec']                                  // only for the functions above
assert.deepEqual(functions.map(fnName).sort(), [...OPEN_TO_APP, ...INNER].sort(), 'the functions are exactly the expected ones')
for (const c of functions) {
  const name = fnName(c)
  const header = c.slice(0, c.indexOf('$fn$'))
  if (!['trash_spec', 'trash_row_columns', 'trash_check_spec'].includes(name)) assert.match(header, /security definer set search_path = ''/, `${name} runs with fixed rules and an empty search path`)
  else assert.match(header, /set search_path = ''/, `${name} has an empty search path`)
  if (OPEN_TO_APP.includes(name)) {
    assert.match(c, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon;`), `${name} is not open to the public`)
    assert.match(c, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated;`), `${name} is open to signed-in people`)
  } else {
    assert.match(c, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`), `${name} is closed to the app`)
    assert.ok(!new RegExp(`grant execute on function public\\.${name}\\(`).test(c), `${name} is never granted`)
  }
}

console.log('trash checks passed')
