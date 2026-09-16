// ──────────────────────────────────────────────────────────
//  Studio · Tour Management Demo Data
//  Advances, crew, and guest lists for demo artists.
// ──────────────────────────────────────────────────────────

import type { ShowAdvance, CrewMember, GuestListEntry, TourData, TravelItem } from '@/types'

// ── Mascolo ────────────────────────────────────────────────
// Shows match IDs in demo-data.ts tour section
const MASCOLO_ADVANCES: ShowAdvance[] = [
  {
    id: 'adv-mas-001',
    showId: 'show-mas-001',
    status: 'complete',
    sentAt: '2026-07-01',
    completedAt: '2026-07-10',
    schedule: {
      busCall:          '12:00',
      lobbyCall:        '11:45',
      loadIn:           '13:00',
      lineCheck:        '16:00',
      soundcheck:       '17:00',
      artistSoundcheck: '18:00',
      doorsOpen:        '21:00',
      headlineOn:       '23:00',
      curfew:           '02:00',
      loadOut:          '02:30',
      departureTime:    '03:00',
      notes:            'Club capacity 1,500. Strict 02:00 curfew enforced by city ordinance.',
    },
    production: {
      stageWidth:        '40ft',
      stageDepth:        '24ft',
      roofHeight:        '22ft',
      fohPosition:       'Center, 60ft from stage',
      monPosition:       'Stage left wing',
      powerSupply:       '3-phase 200A per side',
      localCrewCount:    '6 (2 stage, 2 lighting, 2 audio)',
      backlineNotes:     'Pioneer CDJ-3000s × 4, DJM-V10 mixer, 1210 turntables available',
      riserCount:        '1 × 4ft riser center stage',
      merchandiseLocation: 'Foyer, north entrance',
      notes:             'Stage is wet from previous show. Bring extra towels.',
    },
    hospitality: {
      hotel:                'Williamsburg Hotel',
      hotelAddress:         '96 Wythe Ave, Brooklyn, NY 11249',
      hotelPhone:           '+1 718-362-8100',
      hotelConfirmation:    'WH-44821',
      checkIn:              '15:00',
      checkOut:             '11:00',
      roomCount:            '3',
      roomNotes:            'Mascolo - King Suite 401. TM - King 312. FOH - Double 310.',
      dressingRooms:        '1 artist room (stage right), 1 support room (stage left)',
      dressingRoomNotes:    'Artist room has private bathroom. Code for green room is 4491.',
      cateringCompany:      'Venue in-house',
      mealTimes:            'Dinner at 19:00 (hot buffet), Buyout $250 post-show',
      dietaryNotes:         'Gluten-free options required. No shellfish.',
      runnerName:           'Alex Torres',
      runnerPhone:          '+1 917-555-0193',
      notes:                'Rider includes 1× Grey Goose 750ml, Heineken case, charcuterie board.',
    },
    logistics: {
      parkingInstructions:  'Artist van: Stage door on N 10th St. Loading dock code: 7744.',
      busParking:           'N/A - no bus on this run',
      loadingDockAddress:   '66 N 10th St, Brooklyn, NY 11211',
      loadingDockNotes:     'Freight elevator available. Max 2,000 lbs.',
      nearestAirport:       'JFK International (18mi) / LGA (12mi)',
      distanceToAirport:    '35 min to JFK, 25 min to LGA (no traffic)',
      groundTransport:      'Black car arranged through venue for arrival/departure',
      flights:              'DL 447 → JFK Dep 08:30 (pre-show) | Return open',
      notes:                'No-fly zone nearby — helicopter noise during soundcheck possible.',
    },
    contacts: [
      { id: 'c1', role: 'Production Manager', name: 'Jamie Chen',       phone: '+1 718-555-0122', email: 'jamie@bk-mirage.com' },
      { id: 'c2', role: 'Hospitality',        name: 'Sofia Reyes',      phone: '+1 718-555-0134', email: 'sofia@bk-mirage.com' },
      { id: 'c3', role: 'Security Head',      name: 'Marcus Webb',      phone: '+1 718-555-0156' },
      { id: 'c4', role: 'Promoter',           name: 'Noah Klein',       phone: '+1 646-555-0177', email: 'noah@mnstrkll.com' },
      { id: 'c5', role: 'FOH (House)',        name: 'Tyler Drummond',   phone: '+1 718-555-0199' },
    ],
    wifi:           'BKMIRAGE_ARTIST',
    wifiPassword:   'Mirage2026!',
    weatherNotes:   'Clear, 72°F. No rain expected.',
    guestListCap:   '20',
    guestListNotes: 'Submit names by 18:00 day-of to Jamie Chen.',
    generalNotes:   'This is a sold-out show. Full production advance signed off. No changes to stage plot without PM approval.',
  },
  {
    id: 'adv-mas-002',
    showId: 'show-mas-002',
    status: 'in-progress',
    sentAt: '2026-07-15',
    schedule: {
      loadIn:           '14:00',
      soundcheck:       '17:30',
      doorsOpen:        '22:00',
      headlineOn:       '01:00',
      curfew:           '03:00',
      notes:            'Fabric runs late — expect 01:30 actual on-stage.',
    },
    production: {
      stageWidth:    '30ft',
      stageDepth:    '20ft',
      powerSupply:   '3-phase 100A',
      backlineNotes: 'Funktion-One system throughout. Resident CDJs available.',
      notes:         'Awaiting stage dimensions confirmation from Fabric tech team.',
    },
    hospitality: {
      hotel:          'The Hoxton, Shoreditch',
      hotelAddress:   '81 Great Eastern St, London EC2A 3HU',
      checkIn:        '14:00',
      checkOut:       '12:00',
      roomCount:      '2',
      dressingRooms:  'Room 3 backstage corridor',
      cateringCompany: 'Venue catering',
      mealTimes:      'Hot meal available 20:00–23:00. £100 food buyout post-show.',
      notes:          'Hospitality rider still outstanding — chasing Sofia.',
    },
    logistics: {
      nearestAirport: 'London Heathrow (LHR) / City Airport (LCY)',
      groundTransport: 'Addison Lee account booked — confirmation pending',
      flights:         'BA 117 LHR → JFK | Dep 10:25, 24 Aug',
      notes:           'Artist traveling from NYC. BA business class booked.',
    },
    contacts: [
      { id: 'c6', role: 'Production Manager', name: 'Lena Kroft',    phone: '+44 20 7739 4040', email: 'lena@fabriclondon.com' },
      { id: 'c7', role: 'Promoter',           name: 'Damian Ford',   phone: '+44 7700 900123',  email: 'damian@fwd.co.uk' },
    ],
    wifi:          'FABRIC_ARTIST',
    generalNotes:  'Advance is 60% complete. Still waiting on: hospitality rider, full stage plot from venue, ground transport confirmation.',
  },
  {
    id: 'adv-mas-003',
    showId: 'show-mas-003',
    status: 'draft',
    schedule: {},
    production: {},
    hospitality: {},
    logistics: {},
    contacts: [],
    generalNotes: 'Advance not yet started. Show confirmed 3 weeks out.',
  },
]

const MASCOLO_CREW: CrewMember[] = [
  { id: 'crew-m1', personId: 'person-dana',   role: 'tour-manager' },
  { id: 'crew-m2', personId: 'person-ben',    role: 'production-manager' },
  { id: 'crew-m3', personId: 'person-riley',  role: 'foh' },
  { id: 'crew-m4', personId: 'person-jordanm', role: 'backline' },
  { id: 'crew-m5', personId: 'person-chris',  role: 'lighting' },
  { id: 'crew-m6', personId: 'person-taylor', role: 'merch' },
]

const MASCOLO_GUESTS: GuestListEntry[] = [
  { id: 'gl-m1', showId: 'show-mas-001', name: 'Alessandro Finelli', qty: 2, category: 'artist',     checkedIn: true,  credential: 'All Access' },
  { id: 'gl-m2', showId: 'show-mas-001', name: 'Marcus Cole',        qty: 1, category: 'management', checkedIn: true,  credential: 'All Access' },
  { id: 'gl-m3', showId: 'show-mas-001', name: 'Priya Sharma',       qty: 2, category: 'label',      checkedIn: false, credential: 'Artist' },
  { id: 'gl-m4', showId: 'show-mas-001', name: 'Elena Vasquez',      qty: 2, category: 'vip',        checkedIn: true,  credential: 'VIP' },
  { id: 'gl-m5', showId: 'show-mas-001', name: 'Jake Morrison',      qty: 1, category: 'media',      checkedIn: false, credential: 'Press', notes: 'Rolling Stone feature' },
  { id: 'gl-m6', showId: 'show-mas-001', name: 'Sofia Reyes',        qty: 4, category: 'family',     checkedIn: false },
]

const MASCOLO_TRAVEL: TravelItem[] = [
  // ── Brooklyn Mirage (Aug 14) — domestic, no flight needed ──────────
  {
    id: 'trv-m1', showId: 'show-mas-001', kind: 'hotel', status: 'booked',
    name: 'The William Vale', address: '111 N 12th St, Brooklyn, NY 11249',
    phone: '+1 718-631-8400',
    checkIn: '2026-08-13', checkOut: '2026-08-15',
    roomCount: 4, roomType: 'King / Two Queen Mix',
    confirmationCode: 'WVAL-7291A', cost: 2400, currency: 'USD',
    notes: 'Mascolo in Suite 901. TM + crew in rooms 812–815.',
  },
  {
    id: 'trv-m2', showId: 'show-mas-001', kind: 'ground', status: 'booked',
    type: 'transfer', provider: 'Silver Star Transportation',
    from: 'Manhattan', to: 'The William Vale', pickupTime: '2026-08-13T14:00',
    confirmationCode: 'SST-88201', vehicleType: 'Sprinter Van',
    cost: 350, currency: 'USD',
  },
  {
    id: 'trv-m3', showId: 'show-mas-001', kind: 'ground', status: 'booked',
    type: 'transfer', provider: 'Silver Star Transportation',
    from: 'The William Vale', to: 'Brooklyn Mirage', pickupTime: '2026-08-14T21:30',
    confirmationCode: 'SST-88202', vehicleType: 'Sprinter Van',
    cost: 200, currency: 'USD',
  },
  // ── Fabric London (Aug 23) — international flight ──────────────────
  {
    id: 'trv-m4', showId: 'show-mas-002', kind: 'flight', status: 'booked',
    traveler: 'Full Party (8)',
    legs: [{
      id: 'leg-m4a', airline: 'British Airways', flightNumber: 'BA 178',
      from: 'JFK', fromCity: 'New York',
      to: 'LHR', toCity: 'London',
      departure: '2026-08-21T21:05', arrival: '2026-08-22T09:30',
      duration: '6h 55m', cabin: 'Business',
    }],
    seats: '2A, 2C, 4A, 4C, 6A, 6C, 8A, 8C',
    confirmationCode: 'BA-GHX9201', cost: 18400, currency: 'USD',
  },
  {
    id: 'trv-m5', showId: 'show-mas-002', kind: 'hotel', status: 'booked',
    name: 'The Hoxton, Shoreditch', address: '81 Great Eastern St, London EC2A 3HU',
    phone: '+44 20 7550 1000',
    checkIn: '2026-08-22', checkOut: '2026-08-24',
    roomCount: 5, roomType: 'Roomy + Cosy Rooms',
    confirmationCode: 'HOX-LNSHO-4421', cost: 3600, currency: 'GBP',
  },
  {
    id: 'trv-m6', showId: 'show-mas-002', kind: 'ground', status: 'booked',
    type: 'transfer', provider: 'Sixt Chauffeur',
    from: 'LHR Terminal 5', to: 'The Hoxton, Shoreditch', pickupTime: '2026-08-22T10:00',
    confirmationCode: 'SIXT-LHR-9920', vehicleType: '2× Mercedes V-Class',
    cost: 420, currency: 'GBP',
  },
  {
    id: 'trv-m7', showId: 'show-mas-002', kind: 'flight', status: 'booked',
    traveler: 'Full Party (8)',
    legs: [{
      id: 'leg-m7a', airline: 'Lufthansa', flightNumber: 'LH 911',
      from: 'LHR', fromCity: 'London',
      to: 'TXL', toCity: 'Berlin',
      departure: '2026-08-24T13:15', arrival: '2026-08-24T16:20',
      duration: '2h 05m', cabin: 'Economy',
    }],
    confirmationCode: 'LH-7XC992', cost: 2100, currency: 'EUR',
    notes: 'Connecting to Berghain show Sep 5 — staying in Berlin for 2 weeks.',
  },
  // ── Berghain Berlin (Sep 5) — already in Berlin ────────────────────
  {
    id: 'trv-m8', showId: 'show-mas-003', kind: 'hotel', status: 'booked',
    name: 'Michelberger Hotel', address: 'Warschauer Str. 39-40, 10243 Berlin',
    phone: '+49 30 2977 8590',
    checkIn: '2026-08-24', checkOut: '2026-09-06',
    roomCount: 4, roomType: 'Mixed',
    confirmationCode: 'MICH-BER-1107', cost: 6800, currency: 'EUR',
    notes: 'Extended stay — 13 nights to cover both London travel and Berghain show.',
  },
  {
    id: 'trv-m9', showId: 'show-mas-003', kind: 'ground', status: 'needed',
    type: 'rental-car', provider: undefined,
    from: 'Michelberger Hotel', to: 'Berghain', pickupTime: '2026-09-04T20:00',
    vehicleType: 'Sprinter Van',
    notes: 'Need to book — 3 runners + equipment transport to Berghain.',
  },
  // ── Shelter Amsterdam (Sep 20) ─────────────────────────────────────
  {
    id: 'trv-m10', showId: 'show-mas-004', kind: 'flight', status: 'booked',
    traveler: 'Full Party (8)',
    legs: [{
      id: 'leg-m10a', airline: 'easyJet', flightNumber: 'U2 2163',
      from: 'BER', fromCity: 'Berlin',
      to: 'AMS', toCity: 'Amsterdam',
      departure: '2026-09-19T08:30', arrival: '2026-09-19T10:15',
      duration: '1h 45m', cabin: 'Economy',
    }],
    confirmationCode: 'EZY-AMS-4410', cost: 1800, currency: 'EUR',
  },
  {
    id: 'trv-m11', showId: 'show-mas-004', kind: 'hotel', status: 'pending',
    name: 'Hotel V Nesplein', address: 'Nes 49, 1012 KD Amsterdam',
    checkIn: '2026-09-19', checkOut: '2026-09-21',
    roomCount: 4, confirmationCode: undefined,
    cost: 2200, currency: 'EUR',
    notes: 'Awaiting confirmation from hotel.',
  },
  {
    id: 'trv-m12', showId: 'show-mas-004', kind: 'ground', status: 'needed',
    type: 'transfer',
    from: 'AMS Schiphol', to: 'Hotel V Nesplein',
    notes: 'Need to book airport transfer.',
  },
]

export const MASCOLO_TOUR: TourData = {
  shows: [
    { id: 'show-mas-001', date: '2026-08-14', city: 'Brooklyn, NY', venue: 'Brooklyn Mirage',   time: '23:00', status: 'confirmed' },
    { id: 'show-mas-002', date: '2026-08-23', city: 'London, UK',   venue: 'Fabric',             time: '01:00', status: 'confirmed' },
    { id: 'show-mas-003', date: '2026-09-05', city: 'Berlin, DE',   venue: 'Berghain',           time: '00:00', status: 'hold'      },
    { id: 'show-mas-004', date: '2026-09-20', city: 'Amsterdam, NL', venue: 'Shelter Amsterdam', time: '22:00', status: 'confirmed' },
  ],
  advances:  MASCOLO_ADVANCES,
  crew:      MASCOLO_CREW,
  guestList: MASCOLO_GUESTS,
  travel:    MASCOLO_TRAVEL,
  venues:    [],
}

// ── Nimino ─────────────────────────────────────────────────
export const NIMINO_TOUR: TourData = {
  shows: [
    { id: 'show-nim-001', date: '2026-08-20', city: 'Chicago, IL',    venue: 'Prysm',          time: '22:00', status: 'confirmed' },
    { id: 'show-nim-002', date: '2026-09-10', city: 'Los Angeles, CA', venue: 'Exchange LA',    time: '21:00', status: 'confirmed' },
    { id: 'show-nim-003', date: '2026-09-25', city: 'Miami, FL',      venue: 'Club Space',     time: '00:00', status: 'hold'      },
  ],
  advances: [
    {
      id: 'adv-nim-001',
      showId: 'show-nim-001',
      status: 'sent',
      sentAt: '2026-07-20',
      schedule: { loadIn: '15:00', soundcheck: '18:00', doorsOpen: '21:00', headlineOn: '23:30', curfew: '02:00' },
      production: { backlineNotes: 'Pioneer setup in-house. Rider submitted.' },
      hospitality: { hotel: 'Loews Chicago Hotel', hotelAddress: '455 N Park Dr, Chicago, IL 60611', checkIn: '15:00', checkOut: '12:00', roomCount: '2' },
      logistics: { nearestAirport: 'ORD (17mi) / MDW (10mi)' },
      contacts: [{ id: 'c10', role: 'Production Manager', name: 'Kyle Shaw', phone: '+1 312-555-0100', email: 'kyle@prysm.com' }],
      generalNotes: 'Waiting on production rider sign-off from venue.',
    },
  ],
  crew: [
    { id: 'crew-n1', personId: 'person-jess', role: 'tour-manager' },
    { id: 'crew-n2', personId: 'person-sam',  role: 'foh' },
  ],
  guestList: [],
  travel: [
    {
      id: 'trv-n1', showId: 'show-nim-001', kind: 'flight', status: 'booked',
      traveler: 'Full Party (3)',
      legs: [{
        id: 'leg-n1a', airline: 'United', flightNumber: 'UA 521',
        from: 'JFK', fromCity: 'New York',
        to: 'ORD', toCity: 'Chicago',
        departure: '2026-08-20T09:00', arrival: '2026-08-20T11:05',
        duration: '3h 05m', cabin: 'Economy',
      }],
      confirmationCode: 'UA-CHI2201', cost: 1200, currency: 'USD',
    },
    {
      id: 'trv-n2', showId: 'show-nim-001', kind: 'hotel', status: 'booked',
      name: 'Loews Chicago Hotel', address: '455 N Park Dr, Chicago, IL 60611',
      checkIn: '2026-08-20', checkOut: '2026-08-21',
      roomCount: 2, confirmationCode: 'LOEWS-CHI-5512', cost: 800, currency: 'USD',
    },
  ],
  venues: [],
}

// ── Sierra Bloom ───────────────────────────────────────────
export const SIERRA_TOUR: TourData = {
  shows: [
    { id: 'show-sie-001', date: '2026-08-28', city: 'Nashville, TN', venue: 'The Ryman',     time: '20:00', status: 'confirmed' },
    { id: 'show-sie-002', date: '2026-09-15', city: 'New York, NY',  venue: 'Radio City MH', time: '20:00', status: 'confirmed' },
    { id: 'show-sie-003', date: '2026-10-01', city: 'Austin, TX',    venue: 'ACL Live',      time: '19:30', status: 'hold'      },
  ],
  advances: [
    {
      id: 'adv-sie-001',
      showId: 'show-sie-001',
      status: 'complete',
      sentAt: '2026-07-10',
      completedAt: '2026-07-22',
      schedule: {
        lobbyCall:        '13:00',
        loadIn:           '14:00',
        soundcheck:       '16:00',
        artistSoundcheck: '17:30',
        doorsOpen:        '19:00',
        headlineOn:       '20:00',
        curfew:           '23:00',
        loadOut:          '23:30',
      },
      production: {
        stageWidth: '60ft', stageDepth: '30ft', roofHeight: '45ft',
        fohPosition: 'Center orchestra, Row J',
        powerSupply: '3-phase 400A',
        localCrewCount: '12',
        backlineNotes: 'Full backline provided per Sierra\'s rider. MIDI rig confirmed.',
        riserCount: '3 × drum riser',
      },
      hospitality: {
        hotel: 'Fairlane Hotel Nashville', hotelAddress: '401 Union St, Nashville, TN 37219',
        checkIn: '15:00', checkOut: '12:00', roomCount: '8',
        roomNotes: 'Sierra - Suite 701. Band rooms 501–505. Crew rooms 301–302.',
        dressingRooms: '3 dressing rooms + production office',
        cateringCompany: 'Southern Charm Catering',
        mealTimes: 'Lunch 13:00, Dinner 18:00, Post-show 23:30',
        dietaryNotes: 'Sierra: vegan. Drummer: nut allergy. Full rider attached.',
        runnerName: 'Brent Collins', runnerPhone: '+1 615-555-0050',
      },
      logistics: {
        parkingInstructions: 'Tour bus: 5th Ave entrance, behind Ryman. TM badge required.',
        busParking: '5th Avenue Nashville — confirmed with venue',
        nearestAirport: 'BNA (9mi)',
        groundTransport: 'Tour bus routing Nashville → NYC confirmed.',
        flights: 'Band flies to Nashville DAY BEFORE. Bus departs post-show.',
      },
      contacts: [
        { id: 'cs1', role: 'Production Manager', name: 'Rachel Kim',   phone: '+1 615-555-0200', email: 'rkim@ryman.com' },
        { id: 'cs2', role: 'Hospitality',        name: 'Walt Greene',  phone: '+1 615-555-0201' },
        { id: 'cs3', role: 'Security Head',      name: 'Doug Franklin', phone: '+1 615-555-0202' },
        { id: 'cs4', role: 'Promoter',           name: 'AEG Nashville', phone: '+1 615-555-0203', email: 'nashville@aegpresents.com' },
      ],
      wifi: 'RYMAN_ARTIST', wifiPassword: 'Ryman1892!',
      weatherNotes: 'High 85°F, chance of afternoon thunderstorm. Bus departs after load out regardless.',
      guestListCap: '30',
      guestListNotes: 'VIP package includes meet & greet (15 winners). Names due 72hrs in advance.',
      generalNotes: 'This is Sierra\'s homecoming show. Full sold-out capacity (2,362). Local press in attendance. Security heightened.',
    },
  ],
  crew: [
    { id: 'crew-s1', personId: 'person-marcus', role: 'tour-manager' },
    { id: 'crew-s2', personId: 'person-andrea', role: 'production-manager' },
    { id: 'crew-s3', personId: 'person-tom',    role: 'foh' },
    { id: 'crew-s4', personId: 'person-lisa',   role: 'monitors' },
    { id: 'crew-s5', personId: 'person-james',  role: 'lighting' },
    { id: 'crew-s6', personId: 'person-nina',   role: 'video' },
    { id: 'crew-s7', personId: 'person-ryan',   role: 'backline' },
    { id: 'crew-s8', personId: 'person-chloe',  role: 'merch' },
  ],
  guestList: [
    { id: 'gl-s1', showId: 'show-sie-001', name: 'Mama + Papa Bloom',  qty: 2, category: 'family',  checkedIn: true,  credential: 'All Access' },
    { id: 'gl-s2', showId: 'show-sie-001', name: 'Republic A&R Team',  qty: 4, category: 'label',   checkedIn: false, credential: 'Artist' },
    { id: 'gl-s3', showId: 'show-sie-001', name: 'Billboard Magazine', qty: 2, category: 'media',   checkedIn: false, credential: 'Press', notes: 'Cover story shoot' },
    { id: 'gl-s4', showId: 'show-sie-001', name: 'Kacey Musgraves',    qty: 2, category: 'artist',  checkedIn: true,  credential: 'All Access' },
  ],
  travel: [
    {
      id: 'trv-s1', showId: 'show-sie-001', kind: 'flight', status: 'booked',
      traveler: 'Full Band (6)',
      legs: [{
        id: 'leg-s1a', airline: 'Southwest', flightNumber: 'WN 1844',
        from: 'LAX', fromCity: 'Los Angeles',
        to: 'BNA', toCity: 'Nashville',
        departure: '2026-08-27T11:30', arrival: '2026-08-27T17:45',
        duration: '3h 15m', cabin: 'Economy',
      }],
      confirmationCode: 'SW-BNA-3310', cost: 3600, currency: 'USD',
    },
    {
      id: 'trv-s2', showId: 'show-sie-001', kind: 'hotel', status: 'booked',
      name: 'Fairlane Hotel Nashville', address: '401 Union St, Nashville, TN 37219',
      checkIn: '2026-08-27', checkOut: '2026-08-29',
      roomCount: 8, confirmationCode: 'FAIR-NASH-7740', cost: 4800, currency: 'USD',
      notes: 'Sierra – Suite 701. Band + crew in rooms 501–507.',
    },
  ],
  venues: [],
}

// ── Empty default (new clients) ────────────────────────────
export const EMPTY_TOUR: TourData = {
  shows:     [],
  advances:  [],
  crew:      [],
  guestList: [],
  travel:    [],
  venues:    [],
}
