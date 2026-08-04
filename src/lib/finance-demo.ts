import type { ClientFinance, Invoice, Expense, PLMonth } from '@/types'

let _inv = 1
let _exp = 1

function inv(i: Omit<Invoice, 'id' | 'number'>): Invoice {
  const num = String(_inv++).padStart(3, '0')
  return { id: 'inv-' + num, number: `INV-2026-${num}`, ...i }
}

function exp(e: Omit<Expense, 'id'>): Expense {
  return { id: 'exp-' + (_exp++), ...e }
}

function pl(month: string, rev: PLMonth['revenue'], expenses: PLMonth['expenses']): PLMonth {
  return { month, revenue: rev, expenses }
}

// ── Mascolo Finance ─────────────────────────────────────────
export const MASCOLO_FINANCE: ClientFinance = {
  invoices: [
    inv({ to: 'Avant Gardner / Brooklyn Mirage', toEmail: 'booking@avantgardner.com', category: 'touring', status: 'paid', issuedDate: '2026-08-23', dueDate: '2026-09-06', paidDate: '2026-08-28', currency: 'USD', items: [{ description: 'Performance Fee — Brooklyn Mirage Aug 22', quantity: 1, rate: 18000 }, { description: 'Production Buyout', quantity: 1, rate: 2000 }] }),
    inv({ to: 'Broadwick Live / Printworks London', toEmail: 'finance@broadwicklive.com', category: 'touring', status: 'sent', issuedDate: '2026-09-06', dueDate: '2026-09-20', currency: 'GBP', items: [{ description: 'Performance Fee — Printworks Sep 5', quantity: 1, rate: 14000 }, { description: 'Production Buyout', quantity: 1, rate: 1500 }] }),
    inv({ to: 'Pioneer DJ Corporation', toEmail: 'accounts@pioneerdj.com', category: 'brand', status: 'paid', issuedDate: '2026-01-15', dueDate: '2026-02-15', paidDate: '2026-02-10', currency: 'USD', items: [{ description: 'Brand Ambassador Q1 Fee', quantity: 1, rate: 11250 }] }),
    inv({ to: 'Pioneer DJ Corporation', toEmail: 'accounts@pioneerdj.com', category: 'brand', status: 'paid', issuedDate: '2026-04-15', dueDate: '2026-05-15', paidDate: '2026-05-08', currency: 'USD', items: [{ description: 'Brand Ambassador Q2 Fee', quantity: 1, rate: 11250 }] }),
    inv({ to: 'Pioneer DJ Corporation', toEmail: 'accounts@pioneerdj.com', category: 'brand', status: 'sent', issuedDate: '2026-07-15', dueDate: '2026-08-15', currency: 'USD', items: [{ description: 'Brand Ambassador Q3 Fee', quantity: 1, rate: 11250 }] }),
    inv({ to: 'HBO / Warner Media', toEmail: 'synclicensing@warnermedia.com', category: 'sync', status: 'paid', issuedDate: '2026-02-21', dueDate: '2026-03-21', paidDate: '2026-03-15', currency: 'USD', items: [{ description: 'Sync License — Euphoria S3 Master + Sync', quantity: 1, rate: 22000 }] }),
    inv({ to: 'Sound LA', toEmail: 'bookings@soundla.com', category: 'touring', status: 'overdue', issuedDate: '2026-07-19', dueDate: '2026-08-02', currency: 'USD', items: [{ description: 'Performance Fee — Sound LA Jul 18', quantity: 1, rate: 16000 }, { description: 'Door Split (12% of $28,400)', quantity: 1, rate: 3408 }] }),
  ],
  expenses: [
    exp({ description: 'Round-trip flights NYC→London (2 pax)', vendor: 'British Airways', amount: 4820, currency: 'USD', category: 'travel', date: '2026-09-01', paid: true }),
    exp({ description: 'Hotel — The Hoxton Shoreditch (3 nights)', vendor: 'The Hoxton', amount: 1260, currency: 'GBP', category: 'travel', date: '2026-09-04', paid: true }),
    exp({ description: 'Studio Session — Electric Lady (8hrs)', vendor: 'Electric Lady Studios', amount: 3200, currency: 'USD', category: 'recording', date: '2026-07-22', paid: true }),
    exp({ description: 'Mastering — Sterling Sound', vendor: 'Sterling Sound', amount: 1800, currency: 'USD', category: 'recording', date: '2026-07-30', paid: true }),
    exp({ description: 'Publicist Retainer — August', vendor: 'Shore Fire Media', amount: 4500, currency: 'USD', category: 'marketing', date: '2026-08-01', paid: true }),
    exp({ description: 'Legal Review — Nike Sync Negotiation', vendor: 'Grubman Shire & Meiselas', amount: 3500, currency: 'USD', category: 'legal', date: '2026-07-15', paid: false }),
    exp({ description: 'Management Commission — July', vendor: 'Studio Management', amount: 6840, currency: 'USD', category: 'management', date: '2026-08-05', paid: false }),
    exp({ description: 'CDJ-3000 (pair) + DJM-A9', vendor: 'Guitar Center Pro', amount: 7200, currency: 'USD', category: 'equipment', date: '2026-06-10', paid: true }),
    exp({ description: 'Rider — Catering + Hospitality', vendor: 'Various', amount: 890, currency: 'USD', category: 'meals', date: '2026-08-22', paid: true }),
  ],
  plMonths: [
    pl('2026-01', { touring: 0, streaming: 12400, sync: 0, brand: 11250, merch: 3200, other: 0 }, { travel: 0, recording: 0, marketing: 4500, legal: 0, management: 5370, equipment: 0, meals: 0, other: 800 }),
    pl('2026-02', { touring: 0, streaming: 13100, sync: 22000, brand: 0, merch: 2800, other: 0 }, { travel: 0, recording: 2400, marketing: 4500, legal: 1200, management: 7680, equipment: 0, meals: 0, other: 600 }),
    pl('2026-03', { touring: 8500, streaming: 14200, sync: 0, brand: 0, merch: 3100, other: 0 }, { travel: 2100, recording: 1800, marketing: 4500, legal: 0, management: 5340, equipment: 0, meals: 420, other: 0 }),
    pl('2026-04', { touring: 12000, streaming: 15600, sync: 0, brand: 11250, merch: 4200, other: 0 }, { travel: 3400, recording: 0, marketing: 4500, legal: 0, management: 7740, equipment: 0, meals: 680, other: 300 }),
    pl('2026-05', { touring: 9800, streaming: 16100, sync: 0, brand: 0, merch: 3800, other: 0 }, { travel: 1800, recording: 3200, marketing: 4500, legal: 800, management: 5940, equipment: 0, meals: 340, other: 0 }),
    pl('2026-06', { touring: 0, streaming: 18400, sync: 0, brand: 0, merch: 5100, other: 2000 }, { travel: 0, recording: 0, marketing: 4500, legal: 0, management: 5100, equipment: 7200, meals: 200, other: 400 }),
    pl('2026-07', { touring: 29400, streaming: 22800, sync: 0, brand: 11250, merch: 6200, other: 0 }, { travel: 0, recording: 5000, marketing: 4500, legal: 3500, management: 17085, equipment: 0, meals: 890, other: 600 }),
  ],
}

// ── nimino Finance ──────────────────────────────────────────
export const NIMINO_FINANCE: ClientFinance = {
  invoices: [
    inv({ to: 'Spinnin\' Events / The Mid Chicago', toEmail: 'finance@spinninevents.com', category: 'touring', status: 'paid', issuedDate: '2026-07-11', dueDate: '2026-07-25', paidDate: '2026-07-20', currency: 'USD', items: [{ description: 'Performance Fee — The Mid Jul 10', quantity: 1, rate: 7000 }, { description: 'Door Split (10% of $13,000)', quantity: 1, rate: 1300 }] }),
    inv({ to: 'Boiler Room Inc', toEmail: 'bookings@boilerroom.tv', category: 'touring', status: 'sent', issuedDate: '2026-09-04', dueDate: '2026-09-18', currency: 'USD', items: [{ description: 'Performance Fee — Boiler Room LA Sep 3', quantity: 1, rate: 5000 }] }),
    inv({ to: 'TikTok Inc', toEmail: 'creator-finance@tiktok.com', category: 'sync', status: 'paid', issuedDate: '2026-03-05', dueDate: '2026-03-19', paidDate: '2026-03-14', currency: 'USD', items: [{ description: 'Creator Fund Integration — Q1', quantity: 1, rate: 9000 }] }),
    inv({ to: 'Spotify AB', toEmail: 'artist-finance@spotify.com', category: 'brand', status: 'paid', issuedDate: '2026-04-05', dueDate: '2026-04-19', paidDate: '2026-04-12', currency: 'USD', items: [{ description: 'Radar Artist Program Q2', quantity: 1, rate: 6000 }] }),
    inv({ to: 'Goldenvoice / The Fonda', toEmail: 'accounting@goldenvoice.com', category: 'touring', status: 'draft', issuedDate: '2026-09-20', dueDate: '2026-10-04', currency: 'USD', items: [{ description: 'Performance Fee — The Fonda Sep 20', quantity: 1, rate: 8500 }, { description: 'Production Buyout', quantity: 1, rate: 1000 }] }),
  ],
  expenses: [
    exp({ description: 'Home Studio Upgrade — Apollo Twin + Monitors', vendor: 'Sweetwater', amount: 2400, currency: 'USD', category: 'equipment', date: '2026-05-15', paid: true }),
    exp({ description: 'Mastering — "Tessera" EP', vendor: 'LANDR Pro', amount: 480, currency: 'USD', category: 'recording', date: '2026-06-01', paid: true }),
    exp({ description: 'Social Media Ads — Instagram/TikTok', vendor: 'Meta / TikTok Ads', amount: 1200, currency: 'USD', category: 'marketing', date: '2026-06-15', paid: true }),
    exp({ description: 'Management Commission — July', vendor: 'Studio Management', amount: 2460, currency: 'USD', category: 'management', date: '2026-08-05', paid: false }),
    exp({ description: 'Flights LAX→ORD (The Mid show)', vendor: 'Southwest Airlines', amount: 380, currency: 'USD', category: 'travel', date: '2026-07-08', paid: true }),
  ],
  plMonths: [
    pl('2026-01', { touring: 0, streaming: 3200, sync: 0, brand: 0, merch: 800, other: 0 }, { travel: 0, recording: 0, marketing: 800, legal: 0, management: 800, equipment: 0, meals: 0, other: 200 }),
    pl('2026-02', { touring: 0, streaming: 4100, sync: 0, brand: 0, merch: 1100, other: 0 }, { travel: 0, recording: 480, marketing: 800, legal: 0, management: 1040, equipment: 0, meals: 0, other: 0 }),
    pl('2026-03', { touring: 0, streaming: 5800, sync: 9000, brand: 0, merch: 1400, other: 0 }, { travel: 0, recording: 0, marketing: 1200, legal: 0, management: 3160, equipment: 0, meals: 0, other: 0 }),
    pl('2026-04', { touring: 0, streaming: 7200, sync: 9000, brand: 6000, merch: 1800, other: 0 }, { travel: 0, recording: 0, marketing: 1200, legal: 0, management: 4440, equipment: 0, meals: 0, other: 200 }),
    pl('2026-05', { touring: 0, streaming: 9400, sync: 0, brand: 6000, merch: 2100, other: 0 }, { travel: 0, recording: 0, marketing: 1200, legal: 0, management: 3480, equipment: 2400, meals: 0, other: 0 }),
    pl('2026-06', { touring: 0, streaming: 11800, sync: 0, brand: 0, merch: 2800, other: 0 }, { travel: 0, recording: 480, marketing: 1200, legal: 0, management: 2920, equipment: 0, meals: 0, other: 0 }),
    pl('2026-07', { touring: 8300, streaming: 14600, sync: 0, brand: 0, merch: 3200, other: 0 }, { travel: 380, recording: 0, marketing: 1200, legal: 0, management: 5220, equipment: 0, meals: 0, other: 0 }),
  ],
}

// ── Sierra Finance ──────────────────────────────────────────
export const SIERRA_FINANCE: ClientFinance = {
  invoices: [
    inv({ to: 'Goldenvoice / Coachella', toEmail: 'accounting@goldenvoice.com', category: 'touring', status: 'paid', issuedDate: '2026-04-11', dueDate: '2026-04-25', paidDate: '2026-04-18', currency: 'USD', items: [{ description: 'Performance Fee — Coachella Weekend 1 Sahara', quantity: 1, rate: 12000 }] }),
    inv({ to: 'Founders Entertainment / Governors Ball', toEmail: 'finance@foundersent.com', category: 'touring', status: 'paid', issuedDate: '2026-06-08', dueDate: '2026-06-22', paidDate: '2026-06-15', currency: 'USD', items: [{ description: 'Performance Fee — Governors Ball Jun 7', quantity: 1, rate: 9000 }] }),
    inv({ to: 'Apple Inc / Apple TV+', toEmail: 'synclicensing@apple.com', category: 'sync', status: 'paid', issuedDate: '2026-05-12', dueDate: '2026-05-26', paidDate: '2026-05-20', currency: 'USD', items: [{ description: 'Sync License — Surface S2 "Pilot" — Master + Sync', quantity: 1, rate: 15000 }] }),
    inv({ to: 'C3 Presents / Lollapalooza', toEmail: 'accounting@c3presents.com', category: 'touring', status: 'sent', issuedDate: '2026-08-02', dueDate: '2026-08-16', currency: 'USD', items: [{ description: 'Performance Fee — Lollapalooza Aug 1', quantity: 1, rate: 14000 }] }),
    inv({ to: 'Levi Strauss & Co', toEmail: 'musicptnrs@levis.com', category: 'brand', status: 'draft', issuedDate: '2026-08-01', dueDate: '2026-08-15', currency: 'USD', items: [{ description: 'Brand Campaign Fee — Deposit (50%)', quantity: 1, rate: 17500 }], notes: 'Hold — contract not yet signed' }),
  ],
  expenses: [
    exp({ description: 'Touring Band Fees — Coachella (4 musicians)', vendor: 'Various', amount: 8000, currency: 'USD', category: 'travel', date: '2026-04-10', paid: true }),
    exp({ description: 'EP Recording — Electra Studios LA (5 days)', vendor: 'Electra Studios', amount: 6500, currency: 'USD', category: 'recording', date: '2026-05-01', paid: true }),
    exp({ description: 'Mixing — Serban Ghenea (4 tracks)', vendor: 'MixStar Studios', amount: 5600, currency: 'USD', category: 'recording', date: '2026-05-20', paid: true }),
    exp({ description: 'Mastering — Bob Ludwig / Gateway', vendor: 'Gateway Mastering', amount: 2200, currency: 'USD', category: 'recording', date: '2026-06-01', paid: true }),
    exp({ description: 'PR Campaign — Shore Fire Media (3 months)', vendor: 'Shore Fire Media', amount: 13500, currency: 'USD', category: 'marketing', date: '2026-05-01', paid: true }),
    exp({ description: 'Music Video Production — "Golden Hour"', vendor: 'Prettybird Productions', amount: 28000, currency: 'USD', category: 'marketing', date: '2026-06-15', paid: true }),
    exp({ description: 'Legal — Republic Records Deal Review', vendor: 'Grubman Shire & Meiselas', amount: 7500, currency: 'USD', category: 'legal', date: '2026-07-20', paid: false }),
    exp({ description: 'Management Commission — July', vendor: 'Studio Management', amount: 4620, currency: 'USD', category: 'management', date: '2026-08-05', paid: false }),
    exp({ description: 'Tour Van Rental — Governors Ball weekend', vendor: 'Enterprise Truck Rental', amount: 980, currency: 'USD', category: 'travel', date: '2026-06-06', paid: true }),
  ],
  plMonths: [
    pl('2026-01', { touring: 0, streaming: 1800, sync: 0, brand: 0, merch: 1200, other: 0 }, { travel: 0, recording: 0, marketing: 4500, legal: 0, management: 750, equipment: 0, meals: 0, other: 0 }),
    pl('2026-02', { touring: 0, streaming: 2400, sync: 0, brand: 0, merch: 1600, other: 0 }, { travel: 0, recording: 6500, marketing: 4500, legal: 0, management: 1000, equipment: 0, meals: 0, other: 0 }),
    pl('2026-03', { touring: 0, streaming: 4200, sync: 0, brand: 0, merch: 2100, other: 0 }, { travel: 0, recording: 7800, marketing: 4500, legal: 0, management: 1260, equipment: 0, meals: 0, other: 0 }),
    pl('2026-04', { touring: 12000, streaming: 8400, sync: 0, brand: 0, merch: 3800, other: 0 }, { travel: 8000, recording: 0, marketing: 4500, legal: 0, management: 4840, equipment: 0, meals: 600, other: 0 }),
    pl('2026-05', { touring: 0, streaming: 14200, sync: 15000, brand: 0, merch: 5200, other: 0 }, { travel: 0, recording: 0, marketing: 17500, legal: 0, management: 5880, equipment: 0, meals: 0, other: 0 }),
    pl('2026-06', { touring: 9000, streaming: 18600, sync: 0, brand: 0, merch: 7100, other: 0 }, { travel: 980, recording: 0, marketing: 0, legal: 0, management: 5205, equipment: 0, meals: 900, other: 0 }),
    pl('2026-07', { touring: 0, streaming: 24800, sync: 0, brand: 0, merch: 9400, other: 0 }, { travel: 0, recording: 0, marketing: 0, legal: 7500, management: 6840, equipment: 0, meals: 0, other: 0 }),
  ],
}

export const EMPTY_FINANCE: ClientFinance = {
  invoices: [],
  expenses: [],
  plMonths: [],
}
