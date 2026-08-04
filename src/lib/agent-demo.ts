import type { AgentData, TourOffer } from '@/types'

function offer(o: Omit<TourOffer, 'id'>): TourOffer {
  return { id: 'off-' + Math.random().toString(36).slice(2, 8), ...o }
}

export const MASCOLO_AGENT: AgentData = {
  offers: [
    offer({ venue: 'Brooklyn Mirage', city: 'New York', country: 'US', date: '2026-08-22', promoter: 'Avant Gardner', guarantee: 18000, door: 15, buyout: 2000, status: 'confirmed' }),
    offer({ venue: 'Printworks', city: 'London', country: 'UK', date: '2026-09-05', promoter: 'Broadwick Live', guarantee: 14000, door: 10, buyout: 1500, status: 'confirmed' }),
    offer({ venue: 'Fabric', city: 'London', country: 'UK', date: '2026-09-06', promoter: 'Fabric', guarantee: 9000, buyout: 1000, status: 'hold' }),
    offer({ venue: 'Club der Visionaere', city: 'Berlin', country: 'DE', date: '2026-09-12', promoter: 'CDV Bookings', guarantee: 6500, door: 20, status: 'hold' }),
    offer({ venue: 'Tresor', city: 'Berlin', country: 'DE', date: '2026-09-13', promoter: 'Tresor GmbH', guarantee: 7500, door: 15, status: 'inquiry', notes: 'Need tech rider before confirming' }),
    offer({ venue: 'Rex Club', city: 'Paris', country: 'FR', date: '2026-09-19', promoter: 'Rex Booking', guarantee: 8000, buyout: 1200, status: 'inquiry' }),
    offer({ venue: 'Marquee', city: 'Sydney', country: 'AU', date: '2026-10-10', promoter: 'Fuzzy Events', guarantee: 22000, door: 10, buyout: 3000, status: 'confirmed' }),
    offer({ venue: 'Spiegeltent', city: 'Melbourne', country: 'AU', date: '2026-10-12', promoter: 'Secret Sounds', guarantee: 18000, door: 10, status: 'hold' }),
    offer({ venue: 'Output', city: 'New York', country: 'US', date: '2026-07-04', promoter: 'Output LLC', guarantee: 12000, buyout: 1500, status: 'settled', settledAt: '2026-07-05', netPayout: 13200 }),
    offer({ venue: 'Sound', city: 'Los Angeles', country: 'US', date: '2026-07-18', promoter: 'Sound LA', guarantee: 16000, door: 12, buyout: 2000, status: 'settled', settledAt: '2026-07-19', netPayout: 19400 }),
    offer({ venue: 'Elsewhere', city: 'New York', country: 'US', date: '2026-06-21', promoter: 'Elsewhere LLC', guarantee: 10000, door: 15, status: 'cancelled', notes: 'Venue flooding — promoter initiated' }),
  ],
}

export const NIMINO_AGENT: AgentData = {
  offers: [
    offer({ venue: 'Boiler Room LA', city: 'Los Angeles', country: 'US', date: '2026-09-03', promoter: 'Boiler Room', guarantee: 5000, status: 'confirmed', notes: 'Full stream set, 90 min' }),
    offer({ venue: 'The Fonda', city: 'Los Angeles', country: 'US', date: '2026-09-20', promoter: 'Goldenvoice', guarantee: 8500, door: 10, buyout: 1000, status: 'confirmed' }),
    offer({ venue: 'Echoplex', city: 'Los Angeles', country: 'US', date: '2026-10-01', promoter: 'Another Planet', guarantee: 6000, door: 12, status: 'hold' }),
    offer({ venue: 'Station 1640', city: 'Los Angeles', country: 'US', date: '2026-10-15', promoter: 'Independent', guarantee: 4500, status: 'inquiry' }),
    offer({ venue: 'Villain', city: 'New York', country: 'US', date: '2026-10-22', promoter: 'Villain Bookings', guarantee: 5500, door: 15, status: 'inquiry' }),
    offer({ venue: 'The Mid', city: 'Chicago', country: 'US', date: '2026-07-10', promoter: 'Spinnin Events', guarantee: 7000, door: 10, status: 'settled', settledAt: '2026-07-11', netPayout: 8300 }),
  ],
}

export const SIERRA_AGENT: AgentData = {
  offers: [
    offer({ venue: 'Coachella Valley Music', city: 'Indio', country: 'US', date: '2026-04-10', promoter: 'Goldenvoice', guarantee: 12000, status: 'settled', settledAt: '2026-04-11', netPayout: 12000, notes: 'Sahara stage, 45 min set' }),
    offer({ venue: 'Governors Ball', city: 'New York', country: 'US', date: '2026-06-07', promoter: 'Founders Entertainment', guarantee: 9000, status: 'settled', settledAt: '2026-06-08', netPayout: 9000 }),
    offer({ venue: 'Lollapalooza', city: 'Chicago', country: 'US', date: '2026-08-01', promoter: 'C3 Presents', guarantee: 14000, door: 5, status: 'confirmed' }),
    offer({ venue: 'Elsewhere Zone One', city: 'New York', country: 'US', date: '2026-08-14', promoter: 'Elsewhere', guarantee: 5000, door: 15, status: 'confirmed' }),
    offer({ venue: 'The Fonda', city: 'Los Angeles', country: 'US', date: '2026-09-12', promoter: 'Goldenvoice', guarantee: 7500, door: 10, status: 'hold' }),
    offer({ venue: 'Fox Theater', city: 'Oakland', country: 'US', date: '2026-09-19', promoter: 'Another Planet', guarantee: 9500, door: 10, status: 'inquiry' }),
    offer({ venue: 'Emo\'s', city: 'Austin', country: 'US', date: '2026-10-03', promoter: 'C3 Presents', guarantee: 6500, buyout: 800, status: 'inquiry' }),
  ],
}

export const EMPTY_AGENT: AgentData = { offers: [] }
