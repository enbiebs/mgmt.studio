// ──────────────────────────────────────────────────────────
//  The demo artist ("Nova Lane (Demo)"), written as the database rows the app reads. Every date is worked out from ONE anchor
//  date (normally today), so re-seeding on any day gives a demo that looks live: shows played a few weeks ago, shows coming up
//  this week, an overdue invoice, a contract about to end. One story, no contradictions between screens:
//    - each show has ONE offer, linked both ways, with the same date, city and venue;
//    - travel is dated the day before the show, the hotel and room count are the same on the advance and on Travel;
//    - the played shows have settlements, paid or part-paid invoices and the deposits that paid them;
//    - contract notes never repeat a date (the end date field is the only place one lives);
//    - what is in the P&L comes from these same records.
//  Pure logic (no network). scripts/check-demo-seed.ts runs these rows through the app's own row reader and logic to prove it,
//  and lib/demo-sql.ts turns them into the SQL that replaces the demo artist.
// ──────────────────────────────────────────────────────────

import { addDays } from '@/lib/utils'
import { r2 } from '@/lib/money'
import { buildOfferSheetSnapshot } from '@/lib/offer-sheet'
import { defaultChecklist } from '@/lib/utils'
import { BUCKET_LABEL, DEFAULT_COMMISSIONS, crewLineAmount, crewPerDiem, snapshotOf } from '@/lib/budget'
import { TRAVEL_BUCKET, computeTravelLines, promoterCovers, type PromoterCovers } from '@/lib/budget-assumptions'
import type { Budget, BudgetAssumptions, BudgetBucket, BudgetCommission, BudgetLine, Client, CrewRate, OfferTerms, TourOffer } from '@/types'

export const DEMO_CLIENT_ID = 'demo-nova-lane'

export interface DemoContext {
  anchor: string          // "today" for the demo, YYYY-MM-DD
  clientId: string
  ownerUserId: string     // the demo's owner: projects given to "me" go to them
}

export type Row = Record<string, unknown>
export type DemoRows = Record<string, Row[]>

export function buildDemoRows(ctx: DemoContext): DemoRows {
  const { anchor, clientId: cid, ownerUserId } = ctx
  const D = (n: number) => addDays(anchor, n)                              // a day, counted from the anchor
  const TS = (n: number, hhmm = '12:00') => `${D(n)}T${hhmm}:00Z`          // a moment, counted from the anchor
  const AT = (n: number, hhmm: string) => `${D(n)}T${hhmm}`                // a local time (flights)
  const id = (...parts: (string | number)[]) => ['dn', ...parts].join('-')

  // ── People, crew ─────────────────────────────────────────
  const P = { nova: id('p', 'nova'), marco: id('p', 'marco'), sam: id('p', 'sam'), priya: id('p', 'priya'), dana: id('p', 'dana'), jo: id('p', 'jo') }
  const people: Row[] = [
    { id: P.nova, client_id: cid, name: 'Nova Lane', email: 'nova@novalane.example', phone: '+1 555-0100', title: 'Artist', activity: [] },
    { id: P.marco, client_id: cid, name: 'Marco Rossi', email: 'marco@novalane.example', phone: '+1 555-0111', title: 'Tour Manager', activity: [] },
    { id: P.sam, client_id: cid, name: 'Sam Ortiz', email: 'sam@novalane.example', phone: '+1 555-0122', title: 'FOH Engineer', activity: [] },
    { id: P.priya, client_id: cid, name: 'Priya Shah', email: 'priya@defected.example', org: 'Defected Records', title: 'A&R', activity: [] },
    { id: P.dana, client_id: cid, name: 'Dana Reyes', email: 'dana@promoco.example', org: 'Promo Co', title: 'Publicist', activity: [] },
    { id: P.jo, client_id: cid, name: 'Jo Weller', email: 'jo@wme.example', org: 'WME', title: 'Booking agent', activity: [] },
  ]
  const CM = { nova: id('cm', 'nova'), marco: id('cm', 'marco'), sam: id('cm', 'sam') }
  const crew_members: Row[] = [
    { id: CM.nova, client_id: cid, role: 'artist', person_id: P.nova },
    { id: CM.marco, client_id: cid, role: 'tour-manager', person_id: P.marco },
    { id: CM.sam, client_id: cid, role: 'foh', person_id: P.sam },
  ]
  const rateMarco: CrewRate = { crewMemberId: CM.marco, toursWithArtist: true, rateUnit: 'day', rateShow: 450, rateTravel: 300, rateAdvance: 300, perDiem: 75, currency: 'USD' }
  const rateSam: CrewRate = { crewMemberId: CM.sam, toursWithArtist: true, rateUnit: 'day', rateShow: 400, rateTravel: 250, perDiem: 75, currency: 'USD' }
  const crew_rates: Row[] = [rateMarco, rateSam].map(r => ({
    crew_member_id: r.crewMemberId, client_id: cid, tours_with_artist: true, rate_unit: r.rateUnit, rate_show: r.rateShow,
    rate_travel: r.rateTravel ?? null, rate_advance: r.rateAdvance ?? null, per_diem: r.perDiem, currency: r.currency,
  }))

  // ── The shows and their offers (each offer and show is one booking, linked both ways) ──
  const S = { brooklyn: id('show', 'brooklyn'), printworks: id('show', 'printworks'), fabric: id('show', 'fabric'), tresor: id('show', 'tresor') }
  const O = { brooklyn: id('offer', 'brooklyn'), printworks: id('offer', 'printworks'), fabric: id('offer', 'fabric'), tresor: id('offer', 'tresor'), berghain: id('offer', 'berghain'), sonar: id('offer', 'sonar'), elsewhere: id('offer', 'elsewhere') }
  const RUN = id('run', 'europe')
  const INV = { brooklyn: id('inv', 'brooklyn'), printworks: id('inv', 'printworks'), pioneerQ3: id('inv', 'pioneer-q3'), hbo: id('inv', 'hbo'), pioneerQ4: id('inv', 'pioneer-q4') }
  const payments: OfferTerms['payments'] = [{ when: '30 days out', pct: 50 }, { when: 'Day of show', pct: 50 }]

  const SHOWS = [
    { id: S.brooklyn, offer: O.brooklyn, day: -45, city: 'Brooklyn, NY', country: 'US', venue: 'Avant Gardner / Brooklyn Mirage', time: '22:00', promoter: 'Avant Gardner', fee: 25000, deposit: 12500, invoice: INV.brooklyn, received: 25000 },
    { id: S.printworks, offer: O.printworks, day: -28, city: 'London, UK', country: 'GB', venue: 'Printworks London', time: '21:00', promoter: 'Printworks London Ltd', fee: 22000, deposit: 11000, invoice: INV.printworks, received: 16000 },
    { id: S.fabric, offer: O.fabric, day: 8, city: 'London, UK', country: 'GB', venue: 'Fabric', time: '01:00', promoter: 'Fabric Life Ltd', fee: 15000, deposit: 7500, invoice: null, received: 7500, run: RUN },
    { id: S.tresor, offer: O.tresor, day: 10, city: 'Berlin, DE', country: 'DE', venue: 'Tresor', time: '03:00', promoter: 'Tresor Berlin GmbH', fee: 12000, deposit: 6000, invoice: null, received: 0, run: RUN },
  ]

  const offerTerms: Record<string, OfferTerms> = {
    [O.brooklyn]: { capacity: 6000, ageLimit: '21+', venueType: 'Open-air warehouse venue', billing: 'Headline', doors: '21:00', setStart: '00:00', setLengthMin: 120, production: 'House production and CDJ-3000 booth', hospitality: 'Dinner and drinks for five', payments },
    [O.printworks]: { capacity: 5000, ageLimit: '18+', venueType: 'Converted print works', billing: 'Headline', doors: '20:00', setStart: '23:00', setLengthMin: 120, production: 'House production', hospitality: 'Dinner and drinks for five', payments },
    [O.fabric]: { capacity: 1600, ageLimit: '18+', venueType: 'Nightclub', billing: 'Headline', doors: '22:00', setStart: '01:00', setLengthMin: 150, hotel: 1500, production: 'Funktion-One system and resident CDJs', hospitality: 'Dinner and drinks for five', payments, radiusMiles: 100, radiusDaysAfter: 14 },
    [O.tresor]: { capacity: 800, ageLimit: '18+', venueType: 'Nightclub', billing: 'Headline', doors: '23:00', setStart: '03:00', setLengthMin: 180, production: 'House production', hospitality: 'Dinner and drinks for five', payments },
    [O.berghain]: { capacity: 1500, ageLimit: '18+', venueType: 'Nightclub', billing: 'Headline', setLengthMin: 180, respondBy: D(3), payments },
    [O.sonar]: { billing: 'Festival set', setLengthMin: 90, respondBy: D(12), alternativeDates: 'The night before is also open' },
  }
  const tour_offers: Row[] = [
    ...SHOWS.map(s => ({
      id: s.offer, client_id: cid, venue: s.venue, city: s.city.split(',')[0], country: s.country, date: D(s.day), promoter: s.promoter, guarantee: s.fee,
      status: s.day < 0 ? 'settled' : 'confirmed', settled_at: s.day < 0 ? D(s.day + 1) : null, net_payout: s.day < 0 ? s.fee : null,
      show_id: s.id, via_agency: false, terms: offerTerms[s.offer], notes: null,
    })),
    { id: O.berghain, client_id: cid, venue: 'Berghain', city: 'Berlin', country: 'DE', date: D(30), promoter: 'Ostgut Ton', guarantee: 14000, status: 'hold', show_id: null, via_agency: false, terms: offerTerms[O.berghain], notes: 'First hold. The promoter wants an answer this week.' },
    { id: O.sonar, client_id: cid, venue: 'Sónar Festival', city: 'Barcelona', country: 'ES', date: D(75), promoter: 'Advanced Music', guarantee: 30000, status: 'inquiry', show_id: null, via_agency: false, terms: offerTerms[O.sonar], notes: null },
    { id: O.elsewhere, client_id: cid, venue: 'Elsewhere', city: 'Brooklyn', country: 'US', date: D(21), promoter: 'Elsewhere NYC', guarantee: 6000, status: 'cancelled', show_id: null, via_agency: false, terms: null, notes: 'Cancelled by the promoter, who gave the date to another act.' },
  ]
  const shows: Row[] = SHOWS.map(s => ({
    id: s.id, client_id: cid, date: D(s.day), city: s.city, venue: s.venue, time: s.time, status: 'confirmed', notes: null,
    tour_offer_id: s.offer, run_id: s.run ?? null, history_only: false, drive_url: null,
  }))
  const show_deals: Row[] = SHOWS.map(s => ({
    show_id: s.id, client_id: cid, guarantee: s.fee, deposit: s.deposit, currency: 'USD', via_agency: false, agency_name: null,
    agency_commission_pct: null, management_commission_pct: null, invoice_id: s.invoice, received: s.received,
  }))
  const runs: Row[] = [{ id: RUN, client_id: cid, name: 'Europe, this fall' }]

  // ── Where the party stays and how it gets there: ONE description, used by Travel and by the advance ──
  const STAY = {
    brooklyn: { name: 'The William Vale', address: '111 N 12th St, Brooklyn, NY 11249', phone: '+1 718-631-8400', rooms: 3, nights: 1, ratePerRoomNight: 420, currency: 'USD', code: 'WV-48120' },
    london1: { name: 'The Hoxton, Shoreditch', address: '81 Great Eastern St, London EC2A 3HU', phone: '+44 20 7550 1000', rooms: 3, nights: 2, ratePerRoomNight: 385, currency: 'GBP', code: 'HX-77310' },
    london2: { name: 'The Hoxton, Shoreditch', address: '81 Great Eastern St, London EC2A 3HU', phone: '+44 20 7550 1000', rooms: 3, nights: 2, ratePerRoomNight: 385, currency: 'GBP', code: 'HX-90254' },
    berlin: { name: 'Hotel Orania.Berlin', address: 'Oranienstrasse 40, 10999 Berlin', phone: '+49 30 6930 5000', rooms: 3, nights: 2, ratePerRoomNight: 210, currency: 'EUR', code: '' },
  }
  const stayCost = (s: { rooms: number; nights: number; ratePerRoomNight: number }) => s.rooms * s.nights * s.ratePerRoomNight
  const party = [P.nova, P.marco, P.sam]

  type Leg = { airline: string; no: string; from: string; fromCity: string; to: string; toCity: string; dep: string; arr: string; duration: string; cabin: string }
  const FLIGHTS = [
    { id: id('tr', 'f-printworks-out'), show: S.printworks, cost: 4100, code: 'BAK7QP', status: 'booked', legs: [{ airline: 'BA', no: '178', from: 'JFK', fromCity: 'New York', to: 'LHR', toCity: 'London', dep: AT(-30, '22:00'), arr: AT(-29, '10:05'), duration: '7h 05m', cabin: 'Premium Economy' }] as Leg[] },
    { id: id('tr', 'f-printworks-back'), show: S.printworks, cost: 3800, code: 'BAK7QQ', status: 'booked', legs: [{ airline: 'BA', no: '117', from: 'LHR', fromCity: 'London', to: 'JFK', toCity: 'New York', dep: AT(-27, '11:40'), arr: AT(-27, '14:30'), duration: '8h 50m', cabin: 'Premium Economy' }] as Leg[] },
    { id: id('tr', 'f-fabric-out'), show: S.fabric, cost: 4200, code: 'BAM2XC', status: 'booked', legs: [{ airline: 'BA', no: '178', from: 'JFK', fromCity: 'New York', to: 'LHR', toCity: 'London', dep: AT(6, '22:00'), arr: AT(7, '10:05'), duration: '7h 05m', cabin: 'Premium Economy' }] as Leg[] },
    { id: id('tr', 'f-tresor-in'), show: S.tresor, cost: 540, code: 'BAM2XD', status: 'booked', legs: [{ airline: 'BA', no: '988', from: 'LHR', fromCity: 'London', to: 'BER', toCity: 'Berlin', dep: AT(9, '09:25'), arr: AT(9, '12:20'), duration: '1h 55m', cabin: 'Economy' }] as Leg[] },
    { id: id('tr', 'f-tresor-home'), show: S.tresor, cost: 3900, code: 'LHZ91K', status: 'booked', legs: [
      { airline: 'LH', no: '191', from: 'BER', fromCity: 'Berlin', to: 'FRA', toCity: 'Frankfurt', dep: AT(11, '07:20'), arr: AT(11, '08:30'), duration: '1h 10m', cabin: 'Economy' },
      { airline: 'LH', no: '400', from: 'FRA', fromCity: 'Frankfurt', to: 'JFK', toCity: 'New York', dep: AT(11, '10:50'), arr: AT(11, '13:20'), duration: '8h 30m', cabin: 'Economy' },
    ] as Leg[] },
  ]
  type Hotel = { id: string; show: string; stay: typeof STAY.brooklyn; checkIn: number; status: string }
  const HOTELS: Hotel[] = [
    { id: id('tr', 'h-brooklyn'), show: S.brooklyn, stay: STAY.brooklyn, checkIn: -45, status: 'booked' },
    { id: id('tr', 'h-printworks'), show: S.printworks, stay: STAY.london1, checkIn: -29, status: 'booked' },
    { id: id('tr', 'h-fabric'), show: S.fabric, stay: STAY.london2, checkIn: 7, status: 'booked' },
    { id: id('tr', 'h-tresor'), show: S.tresor, stay: STAY.berlin, checkIn: 9, status: 'needed' },
  ]
  const GROUND = [
    { id: id('tr', 'g-brooklyn'), show: S.brooklyn, provider: 'Carmel Car Service', from: 'The William Vale', to: 'Brooklyn Mirage', cost: 320, currency: 'USD', status: 'booked', type: 'transfer' },
    { id: id('tr', 'g-fabric'), show: S.fabric, provider: 'Addison Lee', from: 'LHR', to: 'The Hoxton, Shoreditch', cost: 180, currency: 'GBP', status: 'booked', type: 'transfer' },
    { id: id('tr', 'g-tresor'), show: S.tresor, provider: 'Blacklane', from: 'BER', to: 'Hotel Orania.Berlin', cost: 140, currency: 'EUR', status: 'needed', type: 'transfer' },
  ]
  const travel_items: Row[] = [
    ...FLIGHTS.map(f => ({
      id: f.id, client_id: cid, show_id: null, kind: 'flight', status: f.status, confirmation_code: f.code, cost: f.cost, currency: 'USD', traveler: 'Full Party',
      seats: '3', person_ids: party, notes: null,
    })),
    ...HOTELS.map(h => ({
      id: h.id, client_id: cid, show_id: null, kind: 'hotel', status: h.status, confirmation_code: h.stay.code || null, cost: h.status === 'needed' ? null : r2(stayCost(h.stay)), currency: h.stay.currency,
      hotel_name: h.stay.name, address: h.stay.address, phone: h.stay.phone, check_in: D(h.checkIn), check_out: D(h.checkIn + h.stay.nights), room_count: h.stay.rooms, room_type: 'King', person_ids: party, notes: null,
    })),
    ...GROUND.map(g => ({
      id: g.id, client_id: cid, show_id: null, kind: 'ground', status: g.status, cost: g.status === 'needed' ? null : g.cost, currency: g.currency, ground_type: g.type, provider: g.provider,
      from_loc: g.from, to_loc: g.to, person_ids: party, notes: null,
    })),
  ]
  const flight_legs: Row[] = FLIGHTS.flatMap(f => f.legs.map((l, i) => ({
    id: `${f.id}-leg-${i + 1}`, travel_item_id: f.id, leg_order: i + 1, airline: l.airline, flight_number: l.no, from_loc: l.from, from_city: l.fromCity,
    to_loc: l.to, to_city: l.toCity, departure: l.dep, arrival: l.arr, duration: l.duration, cabin: l.cabin,
  })))
  const travel_item_shows: Row[] = [...FLIGHTS, ...HOTELS, ...GROUND].map(t => ({ id: `${t.id}-${t.show}`, travel_item_id: t.id, show_id: t.show }))

  // The text of an advance's "flights" line comes from the same flights.
  const flightsText = (showId: string) => FLIGHTS.filter(f => f.show === showId).map(f => f.legs.map(l => `${l.airline} ${l.no} ${l.from} → ${l.to}, departs ${l.dep.replace('T', ' ')}`).join(' + ')).join(' | ')

  // ── Advances and guest lists ─────────────────────────────
  const ADV = [
    { show: S.brooklyn, status: 'complete', sent: -75, done: -60, stay: STAY.brooklyn, loadIn: '15:00', doors: '21:00', headline: '00:00', curfew: '04:00', stage: ['40ft', '24ft', '22ft'], contacts: [['Production Manager', 'Jamie Chen', 'jamie@avantgardner.example'], ['Hospitality', 'Sofia Reyes', 'sofia@avantgardner.example']], cap: '20' },
    { show: S.printworks, status: 'complete', sent: -50, done: -38, stay: STAY.london1, loadIn: '16:00', doors: '20:00', headline: '23:00', curfew: '02:00', stage: ['60ft', '30ft', '28ft'], contacts: [['Production Manager', 'Lena Kroft', 'lena@printworks.example']], cap: '25' },
    { show: S.fabric, status: 'complete', sent: -12, done: -4, stay: STAY.london2, loadIn: '16:00', doors: '22:00', headline: '01:00', curfew: '04:00', stage: ['30ft', '20ft', '14ft'], contacts: [['Production Manager', 'Tom Hale', 'tom@fabric.example'], ['Hospitality', 'Ruth Adeyemi', 'ruth@fabric.example']], cap: '20' },
    { show: S.tresor, status: 'in-progress', sent: -6, done: null, stay: STAY.berlin, loadIn: '18:00', doors: '23:00', headline: '03:00', curfew: '08:00', stage: ['24ft', '16ft', '10ft'], contacts: [['Promoter', 'Katja Weiss', 'katja@tresor.example']], cap: '15' },
  ]
  const show_advances: Row[] = ADV.map(a => {
    const s = SHOWS.find(x => x.id === a.show)!
    return {
      id: id('adv', a.show.slice(8)), show_id: a.show, status: a.status, sent_at: D(a.sent), completed_at: a.done === null ? null : D(a.done),
      schedule: { loadIn: a.loadIn, soundcheck: '18:30', doorsOpen: a.doors, headlineOn: a.headline, curfew: a.curfew, notes: `${s.venue}: set time confirmed with the promoter.` },
      production: { stageWidth: a.stage[0], stageDepth: a.stage[1], roofHeight: a.stage[2], backlineNotes: 'CDJ-3000s and a DJM-V10 in the booth', notes: a.status === 'complete' ? 'Signed off with the production manager.' : 'Waiting on the stage plot from the venue.' },
      hospitality: {
        hotel: a.stay.name, hotelAddress: a.stay.address, hotelPhone: a.stay.phone, roomCount: String(a.stay.rooms), checkIn: '15:00', checkOut: '11:00',
        ...(a.stay.code ? { hotelConfirmation: a.stay.code } : {}),
        dressingRooms: '1 artist room, 1 support room', mealTimes: 'Dinner 19:00', notes: 'Rider sent.',
      },
      logistics: { nearestAirport: s.city.startsWith('London') ? 'London Heathrow (LHR)' : s.city.startsWith('Berlin') ? 'Berlin Brandenburg (BER)' : 'JFK International', flights: flightsText(a.show) || 'Local show, no flights', groundTransport: GROUND.find(g => g.show === a.show)?.provider ?? 'Venue arranges' },
      guest_list_cap: a.cap, guest_list_notes: 'Names to the production manager by 18:00 on the day.', general_notes: a.status === 'complete' ? 'Advance complete.' : 'Hotel and ground transport still to book.',
    }
  })
  const advance_contacts: Row[] = ADV.flatMap(a => a.contacts.map(([role, name, email], i) => ({ id: id('ac', a.show.slice(8), i + 1), advance_id: id('adv', a.show.slice(8)), role, name, email, phone: null, notes: null })))
  const guest_list_entries: Row[] = [
    { id: id('g', 1), show_id: S.fabric, name: 'Dana Reyes', qty: 2, category: 'media', checked_in: false },
    { id: id('g', 2), show_id: S.fabric, name: 'Priya Shah', qty: 2, category: 'label', checked_in: false },
    { id: id('g', 3), show_id: S.fabric, name: 'Jo Weller', qty: 1, category: 'management', checked_in: false },
    { id: id('g', 4), show_id: S.fabric, name: 'Ines Duarte', qty: 4, category: 'family', checked_in: false },
    { id: id('g', 5), show_id: S.tresor, name: 'Dana Reyes', qty: 2, category: 'media', checked_in: false },
    { id: id('g', 6), show_id: S.tresor, name: 'Katja Weiss', qty: 2, category: 'promo', checked_in: false },
    { id: id('g', 7), show_id: S.printworks, name: 'Priya Shah', qty: 2, category: 'label', checked_in: true },
  ]

  // ── Money: invoices, settlements, deposits, bills ────────
  const invoices: Row[] = [
    { id: INV.brooklyn, client_id: cid, number: 'INV-1001', to_name: 'Avant Gardner', to_email: 'ap@avantgardner.example', category: 'touring', status: 'paid', issued_date: D(-44), due_date: D(-14), paid_date: D(-40), currency: 'USD', notes: null },
    { id: INV.printworks, client_id: cid, number: 'INV-1002', to_name: 'Printworks London Ltd', to_email: 'accounts@printworks.example', category: 'touring', status: 'sent', issued_date: D(-27), due_date: D(-5), paid_date: null, currency: 'USD', notes: 'Part-paid: see the settlement.' },
    { id: INV.pioneerQ3, client_id: cid, number: 'INV-1003', to_name: 'Pioneer DJ Corporation', to_email: 'partners@pioneerdj.example', category: 'brand', status: 'paid', issued_date: D(-100), due_date: D(-70), paid_date: D(-94), currency: 'USD', notes: null },
    { id: INV.hbo, client_id: cid, number: 'INV-1004', to_name: 'HBO / Warner Media', to_email: 'music@hbo.example', category: 'sync', status: 'paid', issued_date: D(-110), due_date: D(-80), paid_date: D(-80), currency: 'USD', notes: null },
    { id: INV.pioneerQ4, client_id: cid, number: 'INV-1005', to_name: 'Pioneer DJ Corporation', to_email: 'partners@pioneerdj.example', category: 'brand', status: 'sent', issued_date: D(-18), due_date: D(12), paid_date: null, currency: 'USD', notes: null },
  ]
  const invoice_line_items: Row[] = [
    { invoice_id: INV.brooklyn, description: 'Guarantee for Brooklyn Mirage', quantity: 1, rate: 25000, sort_order: 0 },
    { invoice_id: INV.printworks, description: 'Guarantee for Printworks London', quantity: 1, rate: 22000, sort_order: 0 },
    { invoice_id: INV.pioneerQ3, description: 'Brand partnership, third quarter instalment', quantity: 1, rate: 11250, sort_order: 0 },
    { invoice_id: INV.hbo, description: 'Sync licence fee for Euphoria, season three', quantity: 1, rate: 42000, sort_order: 0 },
    { invoice_id: INV.pioneerQ4, description: 'Brand partnership, fourth quarter instalment', quantity: 1, rate: 11250, sort_order: 0 },
  ]

  const fx = (n: number) => ({ USD: 1, EUR: 1.08, GBP: 1.27, at: D(n) })
  const settlements: Row[] = [
    {
      id: id('st', 'brooklyn'), client_id: cid, file_path: null, file_name: null, event_name: 'Brooklyn Mirage', venue: 'Avant Gardner / Brooklyn Mirage', promoter: 'Avant Gardner',
      prepared_on: D(-44), prepared_by: 'Avant Gardner finance', currency: 'USD', fx: fx(-44), attendance: { sold: 4000, comps: 120, capacity: 6000 },
      summary: { gross: 216000, taxesAndFees: 21600, netGross: 194400, totalExpenses: 85500, netShowReceipts: 108900 },
      deal: { description: 'Flat guarantee', guarantee: 25000 },
      box_office: [{ tier: 'General admission', capacity: 5000, sold: 3520, price: 45, gross: 158400 }, { tier: 'VIP', capacity: 1000, sold: 480, price: 120, gross: 57600 }],
      expenses: [{ group: 'Production', label: 'Sound, lights and stage', budget: 48000, actual: 46500 }, { group: 'Venue', label: 'Security and staffing', budget: 22000, actual: 21800 }, { group: 'Marketing', label: 'Advertising', budget: 18000, actual: 17200 }],
      payout: [{ label: 'Guarantee', amount: 25000, kind: 'guarantee' }, { label: 'Deposit already paid', amount: -12500, kind: 'deposit' }],
      total_due: 12500, payments: [{ label: 'Balance wire', amount: 12500 }], balance_due: 0, notes: null, confirmed_at: TS(-43, '15:00'),
    },
    {
      id: id('st', 'printworks'), client_id: cid, file_path: null, file_name: null, event_name: 'Printworks London', venue: 'Printworks London', promoter: 'Printworks London Ltd',
      prepared_on: D(-27), prepared_by: 'Printworks accounts', currency: 'USD', fx: fx(-27), attendance: { sold: 3150, comps: 90, capacity: 5000 },
      summary: { gross: 139650, taxesAndFees: 13965, netGross: 125685, totalExpenses: 69900, netShowReceipts: 55785 },
      deal: { description: 'Flat guarantee', guarantee: 22000 },
      box_office: [{ tier: 'General admission', capacity: 4500, sold: 2800, price: 38, gross: 106400 }, { tier: 'VIP', capacity: 500, sold: 350, price: 95, gross: 33250 }],
      expenses: [{ group: 'Production', label: 'Sound, lights and stage', budget: 42000, actual: 39000 }, { group: 'Venue', label: 'Security and staffing', budget: 19000, actual: 18500 }, { group: 'Marketing', label: 'Advertising', budget: 13000, actual: 12400 }],
      payout: [{ label: 'Guarantee', amount: 22000, kind: 'guarantee' }, { label: 'Deposit already paid', amount: -11000, kind: 'deposit' }],
      total_due: 11000, payments: [{ label: 'Part payment', amount: 5000 }], balance_due: 6000, notes: 'The balance is still to come.', confirmed_at: TS(-26, '15:00'),
    },
  ]
  const settlement_shows: Row[] = [{ settlement_id: id('st', 'brooklyn'), show_id: S.brooklyn }, { settlement_id: id('st', 'printworks'), show_id: S.printworks }]

  const dep = (key: string, name: string, day: number, amount: number, o: { invoice?: string; lawyer?: number; done?: boolean } = {}): Row => ({
    id: id('dep', key), client_id: cid, name, date: D(day), amount, currency: 'USD', mgmt: 0.15, lawyer: o.lawyer ?? 0, taxes: 0.2, done: o.done ?? true, invoice_id: o.invoice ?? null,
  })
  // The same split on every deposit (15% management, 20% taxes, and 5% to the lawyer on sync and brand deals), so there is a rule behind each one.
  // A deposit for a show is named dn-dep-<show>-... so a check can prove the show's "received" figure is exactly the deposits recorded for it.
  const deposits: Row[] = [
    dep('pioneer-q3', 'Pioneer DJ brand instalment', -94, 11250, { invoice: INV.pioneerQ3, lawyer: 0.05 }),
    dep('hbo', 'HBO sync fee', -80, 42000, { invoice: INV.hbo, lawyer: 0.05 }),
    dep('brooklyn-deposit', 'Avant Gardner deposit', -75, 12500, { invoice: INV.brooklyn }),
    dep('fabric-deposit', 'Fabric show deposit', -22, 7500),
    dep('bmi-1', 'BMI ROYALTY DIST', -62, 18900),
    dep('printworks-deposit', 'Printworks London deposit', -58, 11000, { invoice: INV.printworks }),
    dep('brooklyn-balance', 'Avant Gardner balance', -40, 12500, { invoice: INV.brooklyn }),
    dep('bmi-2', 'BMI ROYALTY DIST', -31, 19400),
    dep('soundexchange', 'SOUNDEXCHANGE', -30, 2140),
    dep('printworks-part', 'Printworks London part payment', -10, 5000, { invoice: INV.printworks }),
    dep('defected', 'Defected Records distribution', -3, 11800, { done: false }),
  ]

  const vendors: Row[] = [
    { id: id('v', 'vans'), client_id: cid, name: 'Vans Ltd', address: 'Unit 4, Park Royal, London', email: 'hire@vans.example', phone: null, tax_id: null, bank_last4: null, bank_fingerprint: null },
    { id: id('v', 'sound'), client_id: cid, name: 'Sound Hire Co', address: null, email: 'bookings@soundhire.example', phone: null, tax_id: null, bank_last4: null, bank_fingerprint: null },
    { id: id('v', 'atlas'), client_id: cid, name: 'Atlas Digital', address: null, email: 'billing@atlas.example', phone: null, tax_id: null, bank_last4: null, bank_fingerprint: null },
    { id: id('v', 'hartley'), client_id: cid, name: 'Hartley & Co', address: null, email: 'accounts@hartley.example', phone: null, tax_id: null, bank_last4: null, bank_fingerprint: null },
    { id: id('v', 'studio'), client_id: cid, name: 'Studio 4A', address: null, email: 'office@studio4a.example', phone: null, tax_id: null, bank_last4: null, bank_fingerprint: null },
  ]
  // Travel costs live on the bookings above, so no bill repeats them. These are everything else.
  const exp = (key: string, vendor: string, vendorKey: string, description: string, amount: number, currency: string, category: string, day: number, paid: boolean, o: { due?: number; no?: string; run?: string } = {}): Row => ({
    id: id('e', key), client_id: cid, description, vendor, amount, currency, category, date: D(day), paid, vendor_id: id('v', vendorKey),
    due_date: o.due === undefined ? null : D(o.due), bill_number: o.no ?? null, bill_file_path: null, vendor_flags: null, run_id: o.run ?? null, bucket: null,
  })
  const expenses: Row[] = [
    exp('backline-brooklyn', 'Sound Hire Co', 'sound', 'CDJ and backline rental, Brooklyn Mirage', 1200, 'USD', 'equipment', -46, true, { due: -40, no: 'SH-2201' }),
    exp('sound-printworks', 'Sound Hire Co', 'sound', 'Sound hire, Printworks London', 1850, 'GBP', 'equipment', -29, true, { due: -22, no: 'SH-2234' }),
    exp('van-printworks', 'Vans Ltd', 'vans', 'Sprinter van hire, Printworks London', 640, 'GBP', 'travel', -29, true, { due: -22, no: 'V-1029' }),
    exp('marketing-1', 'Atlas Digital', 'atlas', 'Marketing retainer', 4500, 'USD', 'marketing', -61, true, { due: -54, no: 'AD-0914' }),
    exp('marketing-2', 'Atlas Digital', 'atlas', 'Marketing retainer', 4500, 'USD', 'marketing', -31, true, { due: -24, no: 'AD-1015' }),
    exp('marketing-3', 'Atlas Digital', 'atlas', 'Marketing retainer', 4500, 'USD', 'marketing', 0, true, { due: 5, no: 'AD-1116' }),   // paid today, so the current month of the P&L is never empty
    exp('studio', 'Studio 4A', 'studio', 'Studio time for the Night Shift mix', 3200, 'USD', 'recording', -12, true, { due: -5, no: 'S4-5530' }),
    exp('van-europe', 'Vans Ltd', 'vans', 'Sprinter van hire, Fabric and Tresor', 720, 'GBP', 'travel', -1, false, { due: 3, no: 'V-1090', run: RUN }),
    exp('legal', 'Hartley & Co', 'hartley', 'Contract review for the agency renewal', 2500, 'USD', 'legal', -26, false, { due: -6, no: 'HC-3317' }),
  ]
  const expense_shows: Row[] = [
    { id: `${id('e', 'backline-brooklyn')}-${S.brooklyn}`, expense_id: id('e', 'backline-brooklyn'), show_id: S.brooklyn },
    { id: `${id('e', 'sound-printworks')}-${S.printworks}`, expense_id: id('e', 'sound-printworks'), show_id: S.printworks },
    { id: `${id('e', 'van-printworks')}-${S.printworks}`, expense_id: id('e', 'van-printworks'), show_id: S.printworks },
  ]

  // ── Budgets ──────────────────────────────────────────────
  const commissions = (key: string): BudgetCommission[] => DEFAULT_COMMISSIONS.map((c, i) => ({ id: id('bc', key, i + 1), ...c }))
  const crewDays = { advance: 1, travel: 0, show: 1 }
  const crewLines = (key: string): BudgetLine[] => [
    { id: id('bl', key, 'tm'), section: 'production', bucket: 'labor', label: 'Labor: TM (Marco Rossi)', amount: crewLineAmount(rateMarco, crewDays), crewMemberId: CM.marco, days: crewDays },
    { id: id('bl', key, 'foh'), section: 'production', bucket: 'labor', label: 'Labor: FOH (Sam Ortiz)', amount: crewLineAmount(rateSam, crewDays), crewMemberId: CM.sam, days: crewDays },
    { id: id('bl', key, 'pd'), section: 'production', bucket: 'per_diems', label: BUCKET_LABEL.per_diems, amount: crewPerDiem(rateMarco, crewDays) + crewPerDiem(rateSam, crewDays) },
  ]
  const line = (key: string, bucket: BudgetBucket, label: string, amount: number, section: BudgetLine['section'] = 'production'): BudgetLine => ({ id: id('bl', key, bucket), section, bucket, label, amount })
  const budgets: Row[] = []
  const budgetObjs: Record<string, Budget> = {}
  const addBudget = (key: string, showKey: keyof typeof S, offerKey: keyof typeof O, name: string, status: Budget['status'], lines: BudgetLine[], assumptions?: BudgetAssumptions) => {
    const comms = commissions(key)
    const b: Budget = { id: id('b', key), offerId: O[offerKey], showId: S[showKey], name, currency: 'USD', status, version: status === 'locked' ? 2 : 1, lines, commissions: comms }
    budgetObjs[key] = b
    budgets.push({
      id: b.id, client_id: cid, offer_id: b.offerId, show_id: b.showId, run_id: null, name, currency: 'USD', status, version: b.version, lines, commissions: comms, notes: null,
      original: status === 'locked' ? snapshotOf({ ...b, version: 1 }) : null, locked_at: status === 'locked' ? TS(-70) : null, assumptions: assumptions ?? null,
    })
  }
  const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
  // Travel lines for an upcoming show come from the budget's own assumptions (people, nights, estimates), the same way the app works them out.
  const withAssumptions = (key: string, a: BudgetAssumptions, covers: PromoterCovers) => {
    const lines = computeTravelLines(a, covers, fmtUsd).map(t => ({ id: id('bl', key, t.bucket), section: 'production' as const, bucket: TRAVEL_BUCKET[t.kind], label: BUCKET_LABEL[TRAVEL_BUCKET[t.kind]], amount: t.net, calc: { basis: t.basis, gross: t.gross, promoterCovers: t.promoterCovers } }))
    return lines
  }
  addBudget('brooklyn', 'brooklyn', 'brooklyn', 'Brooklyn Mirage', 'locked', [
    line('brooklyn', 'guarantee', 'Guarantee', 25000, 'income'), line('brooklyn', 'sound_lights', 'Sound and lights', 1200, 'sound_lights'), ...crewLines('brooklyn'),
    line('brooklyn', 'hotels', BUCKET_LABEL.hotels, 1260), line('brooklyn', 'local_transport', BUCKET_LABEL.local_transport, 320), line('brooklyn', 'insurance', BUCKET_LABEL.insurance, 150),
  ])
  addBudget('printworks', 'printworks', 'printworks', 'Printworks London', 'locked', [
    line('printworks', 'guarantee', 'Guarantee', 22000, 'income'), line('printworks', 'sound_lights', 'Sound and lights', 2300, 'sound_lights'), ...crewLines('printworks'),
    line('printworks', 'airfare', BUCKET_LABEL.airfare, 7900), line('printworks', 'hotels', BUCKET_LABEL.hotels, 2934), line('printworks', 'local_transport', BUCKET_LABEL.local_transport, 810), line('printworks', 'insurance', BUCKET_LABEL.insurance, 150),
  ])
  const aFabric: BudgetAssumptions = { travelers: 3, rooms: 3, from: 'New York', to: 'London', arrive: D(7), depart: D(9), flight: { amount: 1400, source: 'history', note: 'Based on two of your past trips to London' }, hotel: { amount: 490, source: 'typed' }, ground: { amount: 230, source: 'typed' } }
  addBudget('fabric', 'fabric', 'fabric', 'Fabric London', 'locked', [
    line('fabric', 'guarantee', 'Guarantee', 15000, 'income'), line('fabric', 'sound_lights', 'Sound and lights', 0, 'sound_lights'), ...crewLines('fabric'),
    ...withAssumptions('fabric', aFabric, promoterCovers(offerTerms[O.fabric], (n, from, to) => (from === to ? n : n), 'USD')), line('fabric', 'insurance', BUCKET_LABEL.insurance, 150),
  ], aFabric)
  const aTresor: BudgetAssumptions = { travelers: 3, rooms: 3, from: 'London', to: 'Berlin', arrive: D(9), depart: D(11), flight: { amount: 1480, source: 'typed' }, hotel: { amount: 227, source: 'typed' }, ground: { amount: 150, source: 'typed' } }
  addBudget('tresor', 'tresor', 'tresor', 'Tresor Berlin', 'draft', [
    line('tresor', 'guarantee', 'Guarantee', 12000, 'income'), line('tresor', 'sound_lights', 'Sound and lights', 0, 'sound_lights'), ...crewLines('tresor'),
    ...withAssumptions('tresor', aTresor, promoterCovers(offerTerms[O.tresor], (n, from, to) => (from === to ? n : n), 'USD')), line('tresor', 'insurance', BUCKET_LABEL.insurance, 150),
  ], aTresor)

  // ── Offer sheets: what was sent to the artist for approval, built by the app's own sheet builder from the same offer and budget ──
  const sheetOf = (key: 'fabric' | 'tresor', detail: 'full' | 'summary', sentDay: number, note: string): Row => {
    const row = tour_offers.find(o => o.id === O[key])!
    const offer = { venue: row.venue, city: row.city, country: row.country, date: row.date, promoter: row.promoter, guarantee: row.guarantee, terms: row.terms } as unknown as TourOffer
    const snapshot = { ...buildOfferSheetSnapshot({ client: { name: 'Nova Lane (Demo)' } as Client, offer, budget: budgetObjs[key], detail }), sentOn: D(sentDay) }
    return { id: id('os', key), client_id: cid, offer_id: O[key], version: 1, status: 'approved', detail, message: note, snapshot, sent_at: TS(sentDay), responded_at: TS(sentDay + 1), response_note: 'Approved. Looking forward to it.' }
  }
  const offer_sheets: Row[] = [
    sheetOf('fabric', 'full', -26, 'Fabric London for the Europe run. The full breakdown is attached.'),
    sheetOf('tresor', 'summary', -15, 'Tresor Berlin, straight after Fabric. A summary is attached.'),
  ]

  // ── Music: releases, songs, checklist, credits, posts ────
  const A = { ep: id('a', 'night-shift'), single: id('a', 'reverie') }
  const albums: Row[] = [
    { id: A.ep, client_id: cid, title: 'Night Shift EP', type: 'ep', release_date: D(35), upc: '196871234567', label: 'Defected Records', primary_artist: 'Nova Lane', genre: 'Electronic / House', copyright_p: `℗ ${D(35).slice(0, 4)} Defected Records`, copyright_c: `© ${D(35).slice(0, 4)} Nova Lane` },
    { id: A.single, client_id: cid, title: 'Reverie', type: 'single', release_date: D(-120), upc: '196871233317', label: 'Defected Records', primary_artist: 'Nova Lane', genre: 'Electronic / House', copyright_p: `℗ ${D(-120).slice(0, 4)} Defected Records`, copyright_c: `© ${D(-120).slice(0, 4)} Nova Lane` },
  ]
  const T = { longTime: id('t', 'long-time'), nightShift: id('t', 'night-shift'), afterglow: id('t', 'afterglow'), static: id('t', 'static'), interlude: id('t', 'interlude'), reverie: id('t', 'reverie') }
  const track = (tid: string, album: string, num: number, title: string, stage: string, version: number, touched: string, o: Row): Row => ({
    id: tid, album_id: album, num, title, stage, version, touched, notes: null, explicit: false, language: 'English', ...o,
  })
  const tracks: Row[] = [
    track(T.longTime, A.ep, 1, 'Long Time', 'mix', 3, 'now', { priority: 'lead-single', owner: 'Alex, mixing', due_date: D(6), release_date: D(14), isrc: 'GBKQU2600101', writers: 'Nova Lane, Marco Rossi, Ines Duarte', producers: 'Marco Rossi', publisher: 'Kobalt Music Publishing', pro: 'PRS', duration: '3:48', lyrics: 'Long time, long time, we kept the lights low...', mixer_brief: 'Keep the low end tight, push the vocal 1 dB.' }),
    track(T.nightShift, A.ep, 2, 'Night Shift', 'mix', 2, '3d', { priority: 'single', owner: 'Awaiting artist approval', due_date: D(10), isrc: 'GBKQU2600102', writers: 'Nova Lane, Marco Rossi', producers: 'Marco Rossi', publisher: 'Kobalt Music Publishing', pro: 'PRS', duration: '4:12' }),
    track(T.afterglow, A.ep, 3, 'Afterglow', 'track', 1, '12d', { priority: 'album-cut', owner: 'Nova, finishing the top line', due_date: D(18), writers: 'Nova Lane', producers: 'Marco Rossi', publisher: 'Kobalt Music Publishing', pro: 'PRS', duration: '5:01' }),
    track(T.static, A.ep, 4, 'Static', 'master', 4, '2d', { priority: 'album-cut', owner: 'Mastering at Sterling', due_date: D(12), isrc: 'GBKQU2600104', writers: 'Nova Lane, Ines Duarte', producers: 'Marco Rossi', publisher: 'Kobalt Music Publishing', pro: 'PRS', duration: '3:36' }),
    track(T.interlude, A.ep, 5, 'Interlude 3am', 'done', 2, '1w', { priority: 'album-cut', isrc: 'GBKQU2600105', writers: 'Nova Lane', producers: 'Marco Rossi', publisher: 'Kobalt Music Publishing', pro: 'PRS', duration: '1:24' }),
    track(T.reverie, A.single, 1, 'Reverie', 'done', 5, '3w', { priority: 'single', isrc: 'GBKQU2500077', writers: 'Nova Lane, Marco Rossi', producers: 'Marco Rossi', publisher: 'Kobalt Music Publishing', pro: 'PRS', duration: '3:58' }),
  ]
  const track_credits: Row[] = [
    { id: id('tc', 1), track_id: T.longTime, name: 'Nova Lane', role: 'Songwriter', split: 50, sort_order: 0 },
    { id: id('tc', 2), track_id: T.longTime, name: 'Marco Rossi', role: 'Producer', split: 30, sort_order: 1 },
    { id: id('tc', 3), track_id: T.longTime, name: 'Ines Duarte', role: 'Songwriter', split: 20, sort_order: 2 },
    { id: id('tc', 4), track_id: T.nightShift, name: 'Nova Lane', role: 'Songwriter', split: 60, sort_order: 0 },
    { id: id('tc', 5), track_id: T.nightShift, name: 'Marco Rossi', role: 'Producer', split: 40, sort_order: 1 },
  ]
  const doneKeys = new Set(['splits', 'samples', 'labelcopy', 'isrc', 'upc', 'releasedate', 'artwork'])
  const checklist_items: Row[] = [
    ...defaultChecklist().map(c => ({ album_id: A.ep, key: c.key, label: c.label, phase: c.phase, done: doneKeys.has(c.key), note: null })),
    ...defaultChecklist().map(c => ({ album_id: A.single, key: c.key, label: c.label, phase: c.phase, done: true, note: null })),
  ]
  const release_stakeholders: Row[] = [
    { id: id('rs', 1), album_id: A.ep, role: 'label-am', person_id: P.priya, notes: 'Defected A&R' },
    { id: id('rs', 2), album_id: A.ep, role: 'other', person_id: P.dana, notes: 'Publicist for the EP campaign' },
  ]
  const posts: Row[] = [
    { id: id('post', 1), client_id: cid, date: D(3), title: 'Fabric date announcement', time: '10:00am', type: 'post', release_id: null, auto: false },
    { id: id('post', 2), client_id: cid, date: D(5), title: 'Tresor trip teaser', time: '6:00pm', type: 'tiktok', release_id: null, auto: false },
    { id: id('post', 3), client_id: cid, date: D(10), title: 'Long Time, 15 second teaser', time: '6:00pm', type: 'reel', release_id: A.ep, auto: false },
    { id: id('post', 4), client_id: cid, date: D(14), title: 'Long Time out now', time: '9:00am', type: 'post', release_id: A.ep, auto: false },
    { id: id('post', 5), client_id: cid, date: D(17), title: 'In the studio, behind the scenes', time: '5:00pm', type: 'story', release_id: A.ep, auto: false },
    { id: id('post', 6), client_id: cid, date: D(21), title: 'Night Shift EP announcement', time: '10:00am', type: 'post', release_id: A.ep, auto: false },
  ]

  // ── Contracts: the end date is the only place a date lives, so a note can never disagree with it ──
  const contract = (key: string, title: string, type: string, status: string, counterparty: string, o: { value?: number; signed?: number; expiry?: number; notes?: string; flagged?: boolean }): Row => ({
    id: id('k', key), client_id: cid, title, type, status, counterparty, value: o.value ?? null, currency: 'USD',
    signed_date: o.signed === undefined ? null : D(o.signed), expiry_date: o.expiry === undefined ? null : D(o.expiry), notes: o.notes ?? null, created_at: D(o.signed ?? -30), flagged: o.flagged ?? false,
  })
  const contracts: Row[] = [
    contract('management', 'Management Agreement', 'other', 'signed', 'Noted Management', { signed: -420, expiry: 675, notes: 'Three-year term with a post-term commission period.' }),
    contract('kobalt', 'Publishing Admin: Kobalt', 'publishing', 'signed', 'Kobalt Music Publishing', { value: 180000, signed: -1050, expiry: 25, notes: 'Renewal terms to be opened before the notice period ends.' }),
    contract('wme', 'Touring Agreement: WME', 'touring', 'signed', 'WME', { signed: -1100, expiry: -20, notes: 'Out of term. Renewal being negotiated.', flagged: true }),
    contract('pioneer', 'Brand Partnership: Pioneer DJ', 'brand', 'signed', 'Pioneer DJ Corporation', { value: 45000, signed: -175, expiry: 190 }),
    contract('defected', 'Distribution Agreement: Defected Records', 'recording', 'signed', 'Defected Records', { signed: -300, expiry: 310 }),
    contract('nda', 'NDA: collaboration (name withheld)', 'nda', 'signed', 'Confidential', { signed: -60, expiry: 400 }),
    contract('sample', 'Sample Clearance: Reverie', 'other', 'review', 'Open Door Samples', { notes: 'Waiting on the sample owner to confirm the clearance fee.' }),
    contract('hbo', 'Sync License: HBO "Euphoria S3"', 'sync', 'signed', 'HBO / Warner Media', { value: 42000, signed: -112 }),
    contract('nike', 'Sync License: Nike Campaign', 'sync', 'negotiation', 'Nike', { value: 60000, notes: 'Terms agreed in principle; the usage period is being finalised.' }),
  ]

  // ── Royalties, catalog, finance settings, typed history ──
  const quarterOf = (iso: string) => `Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1} ${iso.slice(0, 4)}`
  const royalty_streams: Row[] = [
    { id: id('rs', 'defected'), client_id: cid, name: 'Defected Records', type: 'Master', amount: 14200, currency: 'GBP', period: `${quarterOf(D(-45))} statement` },
    { id: id('rs', 'kobalt'), client_id: cid, name: 'Kobalt', type: 'Publishing', amount: 9800, currency: 'USD', period: `${quarterOf(D(-45))} statement` },
    { id: id('rs', 'gema'), client_id: cid, name: 'GEMA', type: 'Performance', amount: 3150, currency: 'EUR', period: `${quarterOf(D(-45))} statement` },
  ]
  const catalog_works: Row[] = [
    { id: id('cw', 1), client_id: cid, title: 'Long Time', ipi: '00754839201', writers: 'Nova Lane, Marco Rossi, Ines Duarte', amount: 0, currency: 'USD', bmi: 'ok', mlc: 'ok', sx: 'ok', ppl: 'warn' },
    { id: id('cw', 2), client_id: cid, title: 'Reverie', ipi: '00754839201', writers: 'Nova Lane, Marco Rossi', amount: 8400, currency: 'USD', bmi: 'ok', mlc: 'ok', sx: 'ok', ppl: 'ok' },
    { id: id('cw', 3), client_id: cid, title: 'Night Shift', ipi: '00754839201', writers: 'Nova Lane, Marco Rossi', amount: 0, currency: 'USD', bmi: 'q', mlc: 'q', sx: 'no', ppl: 'no' },
  ]
  const client_finance_settings: Row[] = [{ client_id: cid, home_currency: 'USD', default_commissions: DEFAULT_COMMISSIONS }]

  // Six typed months of history, ending the month before the first record above, so the P&L never counts a month twice and has no gap. (The management commission is the
  // manager's income, not an expense on the artist's books, so it is zero here.)
  const firstRecordDate = [
    ...deposits.map(d => String(d.date)),
    ...expenses.filter(e => e.paid).map(e => String(e.date)),
    ...invoices.filter(i => i.status === 'paid').map(i => String(i.paid_date)),
  ].sort()[0]
  const firstRecordMonth = firstRecordDate.slice(0, 7)
  const monthsBefore = (month: string, n: number) => Array.from({ length: n }, (_, i) => {
    let [y, m] = month.split('-').map(Number); m -= n - i; while (m <= 0) { m += 12; y -= 1 }
    return `${y}-${String(m).padStart(2, '0')}`
  })
  const history = [
    { touring: 18000, streaming: 13100, sync: 22000, brand: 0, merch: 2800, travel: 3200, recording: 2400, marketing: 4500, legal: 1200, equipment: 0, meals: 420, other: 600 },
    { touring: 8500, streaming: 14200, sync: 0, brand: 11250, merch: 3100, travel: 2100, recording: 1800, marketing: 4500, legal: 0, equipment: 900, meals: 420, other: 300 },
    { touring: 24000, streaming: 15600, sync: 0, brand: 0, merch: 4200, travel: 3400, recording: 0, marketing: 4500, legal: 0, equipment: 0, meals: 680, other: 300 },
    { touring: 9800, streaming: 16100, sync: 0, brand: 11250, merch: 3800, travel: 1800, recording: 3200, marketing: 4500, legal: 800, equipment: 0, meals: 340, other: 0 },
    { touring: 0, streaming: 18400, sync: 0, brand: 0, merch: 5100, travel: 0, recording: 0, marketing: 4500, legal: 0, equipment: 7200, meals: 200, other: 400 },
    { touring: 29400, streaming: 22800, sync: 0, brand: 11250, merch: 6200, travel: 2600, recording: 5000, marketing: 4500, legal: 3500, equipment: 0, meals: 890, other: 600 },
  ]
  const pl_months: Row[] = monthsBefore(firstRecordMonth, history.length).map((month, i) => {
    const h = history[i]
    return { client_id: cid, month, rev_touring: h.touring, rev_streaming: h.streaming, rev_sync: h.sync, rev_brand: h.brand, rev_merch: h.merch, rev_other: 0,
      exp_travel: h.travel, exp_recording: h.recording, exp_marketing: h.marketing, exp_legal: h.legal, exp_management: 0, exp_equipment: h.equipment, exp_meals: h.meals, exp_other: h.other }
  })

  // ── Work: projects, the artist's own to-dos ──────────────
  const projects: Row[] = [
    { id: id('pr', 1), client_id: cid, title: 'Night Shift EP artwork', type: 'release', status: 'in-progress', assignee_user: ownerUserId, due_date: D(9), notes: 'Three directions to the artist this week.', created_at: D(-20), from_artist: false },
    { id: id('pr', 2), client_id: cid, title: 'Long Time lyric video', type: 'content', status: 'review', assignee_user: ownerUserId, due_date: D(12), notes: null, created_at: D(-14), from_artist: false },
    { id: id('pr', 3), client_id: cid, title: 'Press kit refresh', type: 'other', status: 'in-progress', assignee_user: null, due_date: D(-4), notes: 'New photos and the Fabric and Tresor dates.', created_at: D(-30), from_artist: false },
    { id: id('pr', 4), client_id: cid, title: 'Europe poster', type: 'show', status: 'in-progress', assignee_user: null, due_date: D(20), notes: null, created_at: D(-10), from_artist: false },
    { id: id('pr', 5), client_id: cid, title: 'Can we film a sunrise set clip for socials?', type: 'content', status: 'submitted', assignee_user: null, due_date: null, notes: null, created_at: D(-2), from_artist: true },
  ]
  const artist_todos: Row[] = [
    { id: id('todo', 1), client_id: cid, title: 'Approve the Night Shift mix', done: false, due_date: D(2), created_at: D(-3) },
    { id: id('todo', 2), client_id: cid, title: 'Send the passport copy to Marco', done: false, due_date: D(5), created_at: D(-6) },
    { id: id('todo', 3), client_id: cid, title: 'Pick the EP artwork direction', done: true, due_date: null, created_at: D(-9) },
  ]

  return {
    vendors, runs, people, crew_members, crew_rates, albums, tracks, track_credits, checklist_items, release_stakeholders, posts, contracts,
    invoices, invoice_line_items, tour_offers, shows, show_deals, budgets, offer_sheets, settlements, settlement_shows, expenses, expense_shows, deposits,
    royalty_streams, catalog_works, pl_months, client_finance_settings, show_advances, advance_contacts, guest_list_entries,
    travel_items, flight_legs, travel_item_shows, projects, artist_todos,
  }
}
