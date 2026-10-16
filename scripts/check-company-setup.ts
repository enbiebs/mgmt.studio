// Checks the new-company first-day steps.  Run with:  npx tsx scripts/check-company-setup.ts
import assert from 'node:assert/strict'
import { companySetupDone, companySteps } from '../src/lib/company-setup'

const done = (ctx: Parameters<typeof companySteps>[0]) => companySteps(ctx).map(s => s.done)

// a brand-new company: nothing is done
assert.deepEqual(done({ artistCount: 0, teammates: [] }), [false, false, false])
assert.ok(!companySetupDone(companySteps({ artistCount: 0, teammates: [] })))

// the first artist ticks the first step by itself; the others wait
assert.deepEqual(done({ artistCount: 1, teammates: [] }), [true, false, false])

// someone invited ticks the second; with no access yet, the third is still open and says so
assert.deepEqual(done({ artistCount: 1, teammates: [{ allClients: false, artistCount: 0 }] }), [true, true, false])
assert.match(companySteps({ artistCount: 1, teammates: [{ allClients: false, artistCount: 0 }] })[2].hint, /cannot open any artist/)
assert.match(companySteps({ artistCount: 1, teammates: [] })[2].hint, /Once someone is on the team/)

// everyone can open something (a role on one artist, or the whole company): all done, so the card goes away
const all = companySteps({ artistCount: 2, teammates: [{ allClients: false, artistCount: 1 }, { allClients: true, artistCount: 0 }] })
assert.deepEqual(all.map(s => s.done), [true, true, true]); assert.ok(companySetupDone(all))

// one person left with nothing keeps the last step open, however many others are set
assert.deepEqual(done({ artistCount: 2, teammates: [{ allClients: false, artistCount: 2 }, { allClients: false, artistCount: 0 }] }), [true, true, false])

// no artists yet but people invited: still sensible, never an error
assert.deepEqual(done({ artistCount: 0, teammates: [{ allClients: false, artistCount: 0 }] }), [false, true, false])

console.log('company-setup: all checks passed')
