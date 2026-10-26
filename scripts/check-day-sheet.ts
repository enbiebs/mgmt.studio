// Checks the day sheet / advance sheet: what is on it, that money never is, and the email link to the venue. (The PDF drawing itself is checked in a real browser: the PDF library does not load in this test runner.)
// Run with:  npx tsx scripts/check-day-sheet.ts
import assert from 'node:assert/strict'
import { advanceMailto, buildDaySheet, daySheetFileName } from '../src/lib/day-sheet'
import { MAILTO_LIMIT } from '../src/lib/email-address'
import type { AdvanceContact, Show, ShowAdvance } from '../src/types'

let n = 0
const check = async (name: string, fn: () => Promise<void> | void) => { await fn(); n++; console.log('  ok  ' + name) }

const show: Show = { id: 's1', date: '2026-11-06', city: 'London', venue: 'Fabric', time: '22:00', status: 'confirmed', guarantee: 54321, deposit: 11111, received: 22222, currency: 'GBP', notes: 'PRIVATE-NOTE', agencyCommissionPct: 10, managementCommissionPct: 15, viaAgency: true, agencyName: 'AGENCY-NAME' }
const adv = (o: Partial<ShowAdvance> = {}): ShowAdvance => ({
  id: 'adv1', showId: 's1', status: 'in-progress',
  schedule: { loadIn: '16:00', soundcheck: '17:30', doorsOpen: '22:00', curfew: '05:00', notes: 'Strict curfew' },
  production: { stageWidth: '12m', stageDepth: '8m', fohPosition: 'Centre', powerSupply: '3-phase', backlineNotes: 'Full backline on site' },
  hospitality: { hotel: 'The Hoxton', hotelAddress: '81 Great Eastern St', hotelConfirmation: 'ABC123', checkIn: '15:00', cateringCompany: 'Fresh Co', mealTimes: '18:00', runnerName: 'Jo', runnerPhone: '0777' },
  logistics: { loadingDockAddress: '77a Charterhouse St', parkingInstructions: 'Rear lot', flights: 'BA283', groundTransport: 'Van 14:00' },
  contacts: [{ id: 'c1', role: 'Production Manager', name: 'Sam Lee', phone: '0123', email: 'Sam@Fabric.com' }, { id: 'c2', role: 'Security', name: 'Ria', email: 'sam@fabric.com' }, { id: 'c3', role: 'Hospitality', name: '', email: 'x@y.com' }],
  wifi: 'Fabric-Guest', wifiPassword: 'pw123', guestListCap: '20', guestListNotes: 'Names by 6pm', generalNotes: 'Bring ID', weatherNotes: 'Rain, 9C',
  ...o,
})

async function main() {
  await check('the sheet has the show on top and every section that has something in it', () => {
    const s = buildDaySheet('Mascolo', show, adv())
    assert.equal(s.artist, 'Mascolo'); assert.equal(s.venue, 'Fabric'); assert.equal(s.city, 'London')
    assert.equal(s.dateLine, 'Friday, November 6, 2026'); assert.equal(s.weather, 'Rain, 9C')
    assert.deepEqual(s.sections.map(x => x.key), ['schedule', 'hotel', 'venue', 'catering', 'travel', 'contacts', 'notes'])
    assert.deepEqual(s.sections[0].rows.map(r => r.label), ['Load In', 'Soundcheck', 'Doors', 'Curfew'])
    assert.equal(s.sections[0].note, 'Strict curfew')
    assert.equal(s.sections.find(x => x.key === 'venue')!.rows.find(r => r.label === 'Stage')!.value, '12m × 8m')
    assert.equal(s.sections.find(x => x.key === 'catering')!.rows.find(r => r.label === 'Runner')!.value, 'Jo 0777')
    assert.equal(s.sections.find(x => x.key === 'notes')!.rows.find(r => r.label === 'WiFi')!.value, 'Fabric-Guest / pw123')
    assert.equal(s.sections.find(x => x.key === 'notes')!.note, 'Names by 6pm\nBring ID')
    assert.equal(s.hasAdvance, true)
  })

  await check('each contact shows name, phone and email; one with only an email is kept too', () => {
    const c = buildDaySheet('M', show, adv()).sections.find(x => x.key === 'contacts')!
    assert.equal(c.rows.length, 3)
    assert.deepEqual(c.rows[0], { label: 'Production Manager', value: 'Sam Lee — 0123 · Sam@Fabric.com' })
    assert.deepEqual(c.rows[2], { label: 'Hospitality', value: 'x@y.com' })
  })

  await check('a contact with only a role and a phone is still on the sheet', () => {
    const c = buildDaySheet('M', show, adv({ contacts: [{ id: 'a', role: 'Security', name: '', phone: '0123' }, { id: 'b', role: '', name: 'Ria' }, { id: 'c', role: 'Nothing', name: '' }] })).sections.find(x => x.key === 'contacts')!
    assert.deepEqual(c.rows, [{ label: 'Security', value: '0123' }, { label: 'Contact', value: 'Ria' }])
  })

  await check('empty parts leave no empty boxes', () => {
    const s = buildDaySheet('M', show, adv({ hospitality: {}, logistics: {}, production: {}, contacts: [], wifi: undefined, wifiPassword: undefined, guestListCap: undefined, guestListNotes: undefined, generalNotes: undefined, weatherNotes: undefined }))
    assert.deepEqual(s.sections.map(x => x.key), ['schedule'])
    assert.equal(s.weather, undefined)
  })

  await check('no advance yet gives a sheet with no sections', () => {
    const s = buildDaySheet('M', show, undefined)
    assert.deepEqual(s.sections, []); assert.equal(s.hasAdvance, false)
  })

  await check('money and private notes are never on the sheet', () => {
    const s = JSON.stringify(buildDaySheet('Mascolo', show, adv()))
    for (const secret of ['54321', '11111', '22222', 'PRIVATE-NOTE', 'AGENCY-NAME', 'guarantee', 'deposit', 'commission']) assert.ok(!s.includes(secret), secret)
  })

  await check('the file name is safe on every computer', () => {
    const s = buildDaySheet('Ma/sco:lo', { ...show, venue: 'Club "X" <live>' }, adv())
    assert.equal(daySheetFileName(s, '2026-11-06'), 'Day sheet - Ma sco lo - Club X live - 2026-11-06.pdf')
    assert.ok(daySheetFileName({ ...s, kind: 'advance' }, '2026-11-06').startsWith('Advance - '))
  })

  await check('the email to the venue goes to every contact once, in their own email program', () => {
    const sheet = buildDaySheet('Mascolo', show, adv(), 'advance')
    const link = advanceMailto(sheet, adv().contacts)!
    assert.ok(link.startsWith('mailto:sam@fabric.com,x@y.com?subject='), link.slice(0, 60))
    const body = decodeURIComponent(link.split('&body=')[1])
    assert.match(body, /Mascolo at Fabric on Friday, November 6, 2026/); assert.match(body, /PDF is attached/); assert.match(body, /Load In: 16:00/)
    assert.ok(!body.includes('pw123') && !body.includes('54321'))
  })
  await check('an address cannot smuggle extra instructions into the email link', () => {
    const bad: AdvanceContact[] = [
      { id: 'a', role: 'x', name: 'A', email: 'x@b.com?body=PAY%20NOW&subject=URGENT' },
      { id: 'b', role: 'x', name: 'B', email: 'y@b.com#frag' },
      { id: 'c', role: 'x', name: 'C', email: 'z@b.com&cc=evil@x.com' },
    ]
    assert.equal(advanceMailto(buildDaySheet('M', show, adv(), 'advance'), bad), null)
    const link = advanceMailto(buildDaySheet('M', show, adv(), 'advance'), [...bad, { id: 'd', role: 'x', name: 'D', email: 'ok@b.com' }])!
    assert.ok(link.startsWith('mailto:ok@b.com?subject='), link.slice(0, 40))
    assert.equal(link.split('?').length, 2, 'one question mark, the one that starts the options')
  })
  await check('nobody to write to means no link', () => {
    const none: AdvanceContact[] = [{ id: 'a', role: 'x', name: 'A' }, { id: 'b', role: 'y', name: 'B', email: 'not-an-email' }]
    assert.equal(advanceMailto(buildDaySheet('M', show, adv(), 'advance'), none), null)
  })
  await check('a long schedule or name never makes a link too long to open', () => {
    const long = buildDaySheet('M', show, adv({ schedule: Object.fromEntries(['loadIn', 'soundcheck', 'doorsOpen', 'curfew', 'busCall', 'lobbyCall'].map(k => [k, 'x'.repeat(400)])) }), 'advance')
    assert.ok(advanceMailto(long, adv().contacts)!.length <= MAILTO_LIMIT)
    const huge = buildDaySheet('M', { ...show, venue: 'V'.repeat(2000) }, adv(), 'advance')
    assert.ok(advanceMailto(huge, adv().contacts)!.length > 0)
  })

  console.log(`${n} checks passed`)
}
main().catch(e => { console.error(e); process.exit(1) })
