// Checks adding, changing and deleting a contract in the app (the open artist's, and only theirs).
// Run with:  npx tsx scripts/check-contracts-store.ts
import assert from 'node:assert/strict'
import { useStore } from '../src/lib/store'
import { onNotice, type Notice } from '../src/lib/notify'
import type { Client, Contract } from '../src/types'

const artist = (id: string): Client => ({
  id, name: id, legal: { contracts: [] },
  tour: { shows: [], advances: [], travel: [], guestList: [] }, finance: { budgets: [], invoices: [], expenses: [], settlements: [] },
  songs: { albums: [] }, content: { posts: [] }, agentData: { offers: [] }, business: { banking: { deposits: [] } }, projects: [],
}) as unknown as Client

useStore.setState({ data: { clients: [artist('c1'), artist('c2')] }, clientId: 'c1', workspaceId: null })
const st = () => useStore.getState()
const contractsOf = (id: string): Contract[] => st().data.clients.find(c => c.id === id)!.legal.contracts

// what the app tells the person (a toast, sometimes with Undo)
const notices: Notice[] = []
onNotice(n => notices.push(n))

async function main() {
// ── adding ──
const id = st().addContract({ title: 'Mgmt deal', counterparty: 'Noted', type: 'management', status: 'signed', expiryDate: '2027-01-01', autoRenews: true, noticeDays: 60, terms: { commission: '20%' } })
assert.match(id, /^ct-/)
assert.equal(contractsOf('c1').length, 1)
const saved = contractsOf('c1')[0]
assert.deepEqual([saved.id, saved.title, saved.autoRenews, saved.noticeDays, saved.terms], [id, 'Mgmt deal', true, 60, { commission: '20%' }])
assert.match(saved.createdAt, /^\d{4}-\d{2}-\d{2}$/, 'it remembers the day it was added')
assert.equal(contractsOf('c2').length, 0, 'only the open artist gets it')
const id2 = st().addContract({ title: 'NDA', counterparty: 'Sam', type: 'nda', status: 'draft' })
assert.notEqual(id, id2, 'every contract has its own id')
assert.equal(contractsOf('c1').length, 2)

// ── changing: everything the form sends replaces what was there; the id and the day it was added stay ──
assert.equal(await st().updateContract(id, { title: 'Mgmt deal (v2)', counterparty: 'Noted', type: 'management', status: 'signed', expiryDate: '2028-01-01' }), true, 'a save reports that it is done')
const changed = contractsOf('c1').find(c => c.id === id)!
assert.deepEqual([changed.title, changed.expiryDate, changed.createdAt], ['Mgmt deal (v2)', '2028-01-01', saved.createdAt])
assert.equal(changed.autoRenews, undefined, 'a box that was cleared in the form is cleared')
assert.equal(changed.noticeDays, undefined)
assert.equal(changed.terms, undefined)
assert.equal(contractsOf('c1').find(c => c.id === id2)!.title, 'NDA', 'the other contract is untouched')
assert.equal(await st().updateContract('nope', { title: 'x', counterparty: 'y', type: 'other', status: 'draft' }), false, 'changing one that does not exist says so')
assert.equal(contractsOf('c1').length, 2, 'changing one that does not exist adds nothing')

// ── the same id on another artist is not touched ──
useStore.setState({ clientId: 'c2' })
assert.equal(await st().updateContract(id, { title: 'Hijack', counterparty: 'x', type: 'other', status: 'draft' }), false)
assert.equal(contractsOf('c1').find(c => c.id === id)!.title, 'Mgmt deal (v2)', 'a change only reaches the open artist')
assert.equal(contractsOf('c2').length, 0)
st().deleteContract(id)
assert.equal(contractsOf('c1').length, 2, 'a delete only reaches the open artist')

// ── deleting: gone at once, with an Undo that puts it back exactly as it was ──
useStore.setState({ clientId: 'c1' })
notices.length = 0
st().deleteContract(id)
assert.deepEqual(contractsOf('c1').map(c => c.id), [id2])
assert.equal(notices.length, 1)
assert.match(notices[0].text, /Contract "Mgmt deal \(v2\)" deleted/)
assert.equal(notices[0].action?.label, 'Undo')
notices[0].action!.run()
assert.deepEqual(contractsOf('c1').map(c => c.id).sort(), [id, id2].sort(), 'Undo brings it back')
assert.deepEqual(contractsOf('c1').find(c => c.id === id), changed, 'exactly as it was')
notices[0].action!.run()
assert.equal(contractsOf('c1').length, 2, 'Undo twice does not make a second copy')
st().deleteContract(id)
assert.deepEqual(contractsOf('c1').map(c => c.id), [id2])
st().deleteContract('nope')
assert.equal(contractsOf('c1').length, 1, 'deleting one that does not exist changes nothing')

// ── no artist open: nothing happens ──
useStore.setState({ clientId: null })
assert.equal(st().addContract({ title: 'x', counterparty: 'y', type: 'other', status: 'draft' }), '', 'no artist open: nothing is added')
assert.equal(contractsOf('c1').length, 1)
assert.equal(await st().updateContract(id2, { title: 'x', counterparty: 'y', type: 'other', status: 'draft' }), false, 'no artist open: nothing is changed')
assert.equal(contractsOf('c1')[0].title, 'NDA')

console.log('contracts-store checks passed')
}
main().catch(e => { console.error(e); process.exit(1) })
