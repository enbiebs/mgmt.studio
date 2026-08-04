// ──────────────────────────────────────────────────────────
//  Studio · Fandom Demo Data
//  Based on the Fandom fan loyalty platform spec:
//   • 5 tiers: Listener → Follower → Supporter → Devotee → Founder
//   • Points: 1pt stream · 100pt ticket · 75pt merch · 50pt referral
//   • Fan pass: unique numbered, Apple Wallet scannable
//   • Affiliate tree: referral graph tracked permanently
// ──────────────────────────────────────────────────────────

import type { FanEngagement, Fan } from '@/types'

// ── MASCOLO fans ───────────────────────────────────────────
const MASCOLO_FANS: Fan[] = [
  { id: 'mf1',  name: 'Jack Thornton',     handle: '@jackhouse',      location: 'London, UK',       tier: 'founder',   points: 18420, fanSince: '2022-03-14', referralCount: 31, totalDescendants: 142, streamsTotal: 12400, ticketsPurchased: 18, merchPurchased: 6,  lastActive: '2026-08-02', passNumber: 1    },
  { id: 'mf2',  name: 'Priya Mehta',       handle: '@priyabeats',     location: 'Manchester, UK',   tier: 'founder',   points: 14880, fanSince: '2022-08-01', referralCount: 24, totalDescendants: 98,  streamsTotal: 9800,  ticketsPurchased: 14, merchPurchased: 4,  lastActive: '2026-08-01', passNumber: 2    },
  { id: 'mf3',  name: 'Nico Voss',         handle: '@nicovoss',       location: 'Berlin, DE',       tier: 'founder',   points: 12200, fanSince: '2023-01-20', referralCount: 18, totalDescendants: 67,  streamsTotal: 8200,  ticketsPurchased: 10, merchPurchased: 3,  lastActive: '2026-08-02', passNumber: 3    },
  { id: 'mf4',  name: 'Chloe Martin',      handle: '@chloemusic',     location: 'Sydney, AU',       tier: 'devotee',   points: 8640,  fanSince: '2023-04-10', referredBy: 'mf1', referralCount: 11, totalDescendants: 34, streamsTotal: 6100, ticketsPurchased: 7, merchPurchased: 2, lastActive: '2026-07-31', passNumber: 7  },
  { id: 'mf5',  name: 'Luis Santos',       handle: '@luisbeats',      location: 'Amsterdam, NL',    tier: 'devotee',   points: 7200,  fanSince: '2023-06-15', referralCount: 8,  totalDescendants: 22,  streamsTotal: 5400,  ticketsPurchased: 6,  merchPurchased: 2,  lastActive: '2026-07-30', passNumber: 9    },
  { id: 'mf6',  name: 'Sophie Clarke',     handle: '@sophieclark',    location: 'Melbourne, AU',    tier: 'devotee',   points: 6400,  fanSince: '2023-09-02', referredBy: 'mf2', referralCount: 7, totalDescendants: 18, streamsTotal: 4800, ticketsPurchased: 5, merchPurchased: 1, lastActive: '2026-07-29', passNumber: 12 },
  { id: 'mf7',  name: 'Tom Bradley',                                  location: 'New York, US',     tier: 'supporter', points: 3800,  fanSince: '2024-02-14', referralCount: 4,  totalDescendants: 8,   streamsTotal: 3200,  ticketsPurchased: 3,  merchPurchased: 1,  lastActive: '2026-07-28', passNumber: 34   },
  { id: 'mf8',  name: 'Aisha Kowalski',    handle: '@aishamusic',     location: 'Toronto, CA',      tier: 'supporter', points: 3200,  fanSince: '2024-03-20', referredBy: 'mf1', referralCount: 3, totalDescendants: 6, streamsTotal: 2800, ticketsPurchased: 2, merchPurchased: 1, lastActive: '2026-07-27', passNumber: 41 },
  { id: 'mf9',  name: 'Finn O\'Brien',                                location: 'Dublin, IE',       tier: 'supporter', points: 2900,  fanSince: '2024-05-08', referralCount: 2,  totalDescendants: 4,   streamsTotal: 2400,  ticketsPurchased: 2,  merchPurchased: 0,  lastActive: '2026-07-26', passNumber: 58   },
  { id: 'mf10', name: 'Maya Tanaka',       handle: '@mayasounds',     location: 'Tokyo, JP',        tier: 'follower',  points: 1200,  fanSince: '2024-08-12', referralCount: 1,  totalDescendants: 2,   streamsTotal: 1100,  ticketsPurchased: 1,  merchPurchased: 0,  lastActive: '2026-07-25', passNumber: 112  },
]

export const MASCOLO_FANDOM: FanEngagement = {
  totalFans:    4840,
  pointsIssued: 2_840_000,
  avgEngagement: 68,
  referralPct:   64,
  liveAttendeeMultiplier: 4.2,
  tierBreakdown: [
    { tier: 'founder',   count: 12,   pct: 0.2,  label: 'Founder'   },
    { tier: 'devotee',   count: 86,   pct: 1.8,  label: 'Devotee'   },
    { tier: 'supporter', count: 420,  pct: 8.7,  label: 'Supporter' },
    { tier: 'follower',  count: 1840, pct: 38.0, label: 'Follower'  },
    { tier: 'listener',  count: 2482, pct: 51.3, label: 'Listener'  },
  ],
  topFans: MASCOLO_FANS,
  recentActivity: [
    { id: 'ma1', fanId: 'mf1', fan: 'Jack Thornton',  type: 'referral', detail: 'Referred @djkowalski',       pts: 50,  date: '2026-08-02' },
    { id: 'ma2', fanId: 'mf3', fan: 'Nico Voss',      type: 'ticket',   detail: 'Brooklyn Mirage · Sep 10',    pts: 100, date: '2026-08-02' },
    { id: 'ma3', fanId: 'mf4', fan: 'Chloe Martin',   type: 'merch',    detail: 'Mascolo 2026 hoodie',         pts: 75,  date: '2026-08-01' },
    { id: 'ma4', fanId: 'mf2', fan: 'Priya Mehta',    type: 'stream',   detail: '"Long Time" — 200th stream',  pts: 200, date: '2026-08-01' },
    { id: 'ma5', fanId: 'mf8', fan: 'Aisha Kowalski', type: 'referral', detail: 'Referred @torontobeats',      pts: 50,  date: '2026-07-31' },
    { id: 'ma6', fanId: 'mf5', fan: 'Luis Santos',    type: 'ticket',   detail: 'MTELUS · Aug 22',             pts: 100, date: '2026-07-30' },
    { id: 'ma7', fanId: 'mf7', fan: 'Tom Bradley',    type: 'share',    detail: 'Shared link on X',            pts: 10,  date: '2026-07-30' },
    { id: 'ma8', fanId: 'mf6', fan: 'Sophie Clarke',  type: 'stream',   detail: '"Fade Away" — 50th stream',   pts: 50,  date: '2026-07-29' },
  ],
  messages: [
    { id: 'mm1', subject: 'Brooklyn Mirage presale — Founders only',   body: '', segment: 'founder',   sentAt: '2026-07-15', openRate: 94, clickRate: 72, recipients: 12  },
    { id: 'mm2', subject: 'Early access: Mascolo 2026 merch drop',     body: '', segment: 'devotee',   sentAt: '2026-07-20', openRate: 81, clickRate: 54, recipients: 86  },
    { id: 'mm3', subject: 'New music coming. You\'ll hear it first.',  body: '', segment: 'supporter', sentAt: '2026-07-28', openRate: 68, clickRate: 38, recipients: 420 },
    { id: 'mm4', subject: 'The Mascolo 2026 era starts now',           body: '', segment: 'all',       sentAt: '2026-08-01', openRate: 52, clickRate: 24, recipients: 4840},
  ],
}

// ── NIMINO fans ────────────────────────────────────────────
const NIMINO_FANS: Fan[] = [
  { id: 'nf1',  name: 'Emma Chen',        handle: '@emmac_music',    location: 'Los Angeles, US',  tier: 'founder',   points: 9200,  fanSince: '2024-01-08', referralCount: 44, totalDescendants: 210, streamsTotal: 6200, ticketsPurchased: 8, merchPurchased: 3, lastActive: '2026-08-02', passNumber: 1  },
  { id: 'nf2',  name: 'Rory Walsh',       handle: '@roryindiewave',  location: 'London, UK',       tier: 'founder',   points: 7800,  fanSince: '2024-02-14', referralCount: 38, totalDescendants: 168, streamsTotal: 5100, ticketsPurchased: 6, merchPurchased: 2, lastActive: '2026-08-01', passNumber: 2  },
  { id: 'nf3',  name: 'Zara Williams',                               location: 'New York, US',     tier: 'devotee',   points: 4400,  fanSince: '2024-05-20', referredBy: 'nf1', referralCount: 22, totalDescendants: 89, streamsTotal: 3200, ticketsPurchased: 4, merchPurchased: 1, lastActive: '2026-08-01', passNumber: 6  },
  { id: 'nf4',  name: 'Kai Nakamura',     handle: '@kainmx',         location: 'Sydney, AU',       tier: 'devotee',   points: 3800,  fanSince: '2024-06-01', referralCount: 14, totalDescendants: 52,  streamsTotal: 2800, ticketsPurchased: 3, merchPurchased: 1, lastActive: '2026-07-31', passNumber: 8  },
  { id: 'nf5',  name: 'Jess Morgan',      handle: '@jessmorgann',    location: 'Toronto, CA',      tier: 'supporter', points: 2200,  fanSince: '2024-09-12', referralCount: 6,  totalDescendants: 18,  streamsTotal: 1900, ticketsPurchased: 2, merchPurchased: 0, lastActive: '2026-07-29', passNumber: 22 },
  { id: 'nf6',  name: 'Arjun Patel',      handle: '@arjunbeats',     location: 'Chicago, US',      tier: 'supporter', points: 1800,  fanSince: '2025-01-03', referredBy: 'nf1', referralCount: 4, totalDescendants: 11, streamsTotal: 1600, ticketsPurchased: 1, merchPurchased: 0, lastActive: '2026-07-28', passNumber: 31 },
]

export const NIMINO_FANDOM: FanEngagement = {
  totalFans:    1240,
  pointsIssued: 680_000,
  avgEngagement: 81,
  referralPct:   68,   // matches deck stat exactly
  liveAttendeeMultiplier: 4.2,
  tierBreakdown: [
    { tier: 'founder',   count: 4,   pct: 0.3,  label: 'Founder'   },
    { tier: 'devotee',   count: 22,  pct: 1.8,  label: 'Devotee'   },
    { tier: 'supporter', count: 98,  pct: 7.9,  label: 'Supporter' },
    { tier: 'follower',  count: 480, pct: 38.7, label: 'Follower'  },
    { tier: 'listener',  count: 636, pct: 51.3, label: 'Listener'  },
  ],
  topFans: NIMINO_FANS,
  recentActivity: [
    { id: 'na1', fanId: 'nf1', fan: 'Emma Chen',    type: 'referral', detail: 'Referred @sophieindieLA',      pts: 50,  date: '2026-08-02' },
    { id: 'na2', fanId: 'nf3', fan: 'Zara Williams', type: 'ticket',  detail: 'EartH Hackney · Aug 14',       pts: 100, date: '2026-08-01' },
    { id: 'na3', fanId: 'nf2', fan: 'Rory Walsh',   type: 'stream',  detail: '"Overgrown" — 300th stream',    pts: 300, date: '2026-08-01' },
    { id: 'na4', fanId: 'nf4', fan: 'Kai Nakamura', type: 'share',   detail: 'TikTok stitch went viral',      pts: 25,  date: '2026-07-31' },
    { id: 'na5', fanId: 'nf5', fan: 'Jess Morgan',  type: 'referral',detail: 'Referred @torontoindie_',       pts: 50,  date: '2026-07-30' },
    { id: 'na6', fanId: 'nf1', fan: 'Emma Chen',    type: 'merch',   detail: 'nimino debut EP tee',           pts: 75,  date: '2026-07-29' },
  ],
  messages: [
    { id: 'nm1', subject: 'London presale — Founders & Devotees',        body: '', segment: 'founder',   sentAt: '2026-07-10', openRate: 96, clickRate: 78, recipients: 4   },
    { id: 'nm2', subject: 'You\'re in the debut EP era. First listen.',   body: '', segment: 'supporter', sentAt: '2026-07-22', openRate: 84, clickRate: 61, recipients: 98  },
    { id: 'nm3', subject: 'nimino is coming to your city',               body: '', segment: 'all',       sentAt: '2026-07-28', openRate: 64, clickRate: 42, recipients: 1240},
  ],
}

// ── SIERRA BLOOM fans ───────────────────────────────────────
const SIERRA_FANS: Fan[] = [
  { id: 'sf1', name: 'Lily Park',          handle: '@lilyparksongs',  location: 'Los Angeles, US',  tier: 'founder',   points: 4800,  fanSince: '2025-06-01', referralCount: 68, totalDescendants: 380, streamsTotal: 3200, ticketsPurchased: 0, merchPurchased: 2, lastActive: '2026-08-02', passNumber: 1  },
  { id: 'sf2', name: 'Grace Thompson',     handle: '@gracetvibes',    location: 'Nashville, US',    tier: 'founder',   points: 3900,  fanSince: '2025-07-14', referralCount: 52, totalDescendants: 240, streamsTotal: 2600, ticketsPurchased: 0, merchPurchased: 1, lastActive: '2026-08-02', passNumber: 2  },
  { id: 'sf3', name: 'Mia Reyes',          handle: '@miareyes_',      location: 'Chicago, US',      tier: 'devotee',   points: 2200,  fanSince: '2025-09-20', referredBy: 'sf1', referralCount: 28, totalDescendants: 98, streamsTotal: 1600, ticketsPurchased: 0, merchPurchased: 0, lastActive: '2026-08-01', passNumber: 5  },
  { id: 'sf4', name: 'Ava Collins',                                   location: 'New York, US',     tier: 'devotee',   points: 1800,  fanSince: '2025-10-08', referredBy: 'sf2', referralCount: 14, totalDescendants: 62, streamsTotal: 1400, ticketsPurchased: 0, merchPurchased: 0, lastActive: '2026-07-31', passNumber: 8  },
  { id: 'sf5', name: 'Isabelle Dumont',    handle: '@isabellemusic',  location: 'London, UK',       tier: 'supporter', points: 980,   fanSince: '2026-01-15', referralCount: 8,  totalDescendants: 22,  streamsTotal: 800,  ticketsPurchased: 0, merchPurchased: 0, lastActive: '2026-07-30', passNumber: 18 },
]

export const SIERRA_FANDOM: FanEngagement = {
  totalFans:    3840,   // TikTok is driving fast fan growth
  pointsIssued: 280_000,
  avgEngagement: 88,
  referralPct:   72,   // very high — TikTok-driven word of mouth
  liveAttendeeMultiplier: 4.2,
  tierBreakdown: [
    { tier: 'founder',   count: 3,    pct: 0.1,  label: 'Founder'   },
    { tier: 'devotee',   count: 18,   pct: 0.5,  label: 'Devotee'   },
    { tier: 'supporter', count: 140,  pct: 3.6,  label: 'Supporter' },
    { tier: 'follower',  count: 1280, pct: 33.3, label: 'Follower'  },
    { tier: 'listener',  count: 2399, pct: 62.5, label: 'Listener'  },
  ],
  topFans: SIERRA_FANS,
  recentActivity: [
    { id: 'sa1', fanId: 'sf1', fan: 'Lily Park',       type: 'referral', detail: 'Referred @sunsetgirls82',    pts: 50,  date: '2026-08-02' },
    { id: 'sa2', fanId: 'sf1', fan: 'Lily Park',       type: 'referral', detail: 'Referred @goldenhourgrace',  pts: 50,  date: '2026-08-02' },
    { id: 'sa3', fanId: 'sf2', fan: 'Grace Thompson',  type: 'stream',   detail: '"Golden Hour" — 100th stream',pts: 100, date: '2026-08-01' },
    { id: 'sa4', fanId: 'sf3', fan: 'Mia Reyes',       type: 'referral', detail: 'Referred @miachicago_',      pts: 50,  date: '2026-08-01' },
    { id: 'sa5', fanId: 'sf4', fan: 'Ava Collins',     type: 'share',    detail: 'Golden Hour TikTok stitch',  pts: 25,  date: '2026-07-31' },
    { id: 'sa6', fanId: 'sf2', fan: 'Grace Thompson',  type: 'merch',    detail: 'Golden Hour tee pre-order',  pts: 75,  date: '2026-07-30' },
  ],
  messages: [
    { id: 'sm1', subject: 'You were here from the start. Thank you.',    body: '', segment: 'founder',   sentAt: '2026-07-20', openRate: 100, clickRate: 88, recipients: 3    },
    { id: 'sm2', subject: 'Golden Hour is out. You helped make this.',   body: '', segment: 'all',       sentAt: '2026-08-04', openRate: 71,  clickRate: 48, recipients: 3840 },
  ],
}

// ── Empty (new clients) ────────────────────────────────────
export const EMPTY_FANDOM: FanEngagement = {
  totalFans: 0, pointsIssued: 0, avgEngagement: 0, referralPct: 0, liveAttendeeMultiplier: 4.2,
  tierBreakdown: [
    { tier: 'founder',   count: 0, pct: 0, label: 'Founder'   },
    { tier: 'devotee',   count: 0, pct: 0, label: 'Devotee'   },
    { tier: 'supporter', count: 0, pct: 0, label: 'Supporter' },
    { tier: 'follower',  count: 0, pct: 0, label: 'Follower'  },
    { tier: 'listener',  count: 0, pct: 0, label: 'Listener'  },
  ],
  topFans: [], recentActivity: [], messages: [],
}
