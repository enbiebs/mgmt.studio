// ──────────────────────────────────────────────────────────
//  Studio · Demo Data
//  This is the data that loads when there's nothing saved.
//  When you add Supabase, this becomes seed data for new accounts.
// ──────────────────────────────────────────────────────────

import type { AppData } from '@/types'
import { MASCOLO_ANALYTICS, NIMINO_ANALYTICS, SIERRA_ANALYTICS } from '@/lib/analytics-demo'
import { MASCOLO_FANDOM, NIMINO_FANDOM, SIERRA_FANDOM } from '@/lib/fandom-demo'
import { MASCOLO_AGENT, NIMINO_AGENT, SIERRA_AGENT } from '@/lib/agent-demo'
import { MASCOLO_LEGAL, NIMINO_LEGAL, SIERRA_LEGAL } from '@/lib/legal-demo'
import { MASCOLO_FINANCE, NIMINO_FINANCE, SIERRA_FINANCE } from '@/lib/finance-demo'
import { MASCOLO_TOUR, NIMINO_TOUR, SIERRA_TOUR } from '@/lib/advance-demo'
import { defaultChecklist } from '@/lib/utils'

export const DEMO_DATA: AppData = {
  clients: [
    {
      id: 'mascolo',
      name: 'Mascolo',
      genre: 'Electronic / House',
      color: '#4c8df6',
      songs: {
        albums: [{
          id: 'a1',
          title: 'Mascolo 2026',
          tracks: [
            { id: 't1',  num: 1,  title: 'Long Time',              stage: 'mix',    version: 10, touched: '10d', priority: 'lead-single', owner: 'Alex Kim — mixing',   dueDate: '2026-08-10', notes: 'Artist wants the drop 4 bars later. Alex re-cutting arrangement.', labelCopy: { isrc: 'USRC12600001', writers: 'D. Mascolo, R. Cole', producers: 'D. Mascolo', pro: 'BMI', duration: '3:24', language: 'English' } },
            { id: 't2',  num: 2,  title: 'CTMH',                   stage: 'mix',    version: 8,  touched: '12d', priority: 'single',      owner: 'Awaiting artist approval', dueDate: '2026-08-12', labelCopy: { isrc: 'USRC12600002', writers: 'D. Mascolo', producers: 'D. Mascolo', pro: 'BMI', duration: '2:58', explicit: true } },
            { id: 't3',  num: 3,  title: 'Nobody Else',            stage: 'mix',    version: 6,  touched: '3d'  },
            { id: 't4',  num: 4,  title: 'All Of My Love',         stage: 'mix',    version: 5,  touched: '5d'  },
            { id: 't5',  num: 5,  title: 'Fade Away',              stage: 'mix',    version: 7,  touched: 'now' },
            { id: 't6',  num: 6,  title: 'Never Changes',          stage: 'mix',    version: 4,  touched: '12d' },
            { id: 't7',  num: 7,  title: "When You're Not Around", stage: 'mix',    version: 3,  touched: '2d'  },
            { id: 't8',  num: 8,  title: 'Close To You',           stage: 'mix',    version: 5,  touched: '12d' },
            { id: 't9',  num: 9,  title: 'Outro',                  stage: 'mix',    version: 2,  touched: '1d'  },
            { id: 't10', num: 10, title: 'The Ropes',              stage: 'track',  version: 1,  touched: '12d', owner: 'Needs vocal session booked', notes: 'Topline written, needs final vocal take before mix can start.' },
          ],
          labelCopy: { label: 'Independent', primaryArtist: 'Mascolo', genre: 'Electronic / House', copyrightP: '℗ 2026 Mascolo Music LLC', copyrightC: '© 2026 Mascolo Music LLC' },
          checklist: defaultChecklist(),
          stakeholders: [
            { id: 'sh-m1', name: 'Dana Wells',    role: 'management', org: 'Noted Management', email: 'dana@notedmanagement.com' },
            { id: 'sh-m2', name: 'Priya Sharma',  role: 'label-am',    org: 'Modular Records',  email: 'priya@modularrecords.com', notes: 'day-to-day release contact' },
            { id: 'sh-m3', name: 'Jordan Ellis',  role: 'label-legal', org: 'Modular Records',  email: 'jordan@modularrecords.com', notes: 'handles sample clearances' },
          ],
        }],
      },
      tour: MASCOLO_TOUR,
      content: {
        posts: [
          { id: 'p1', date: '2026-07-28', title: 'Trial Reel',  time: '9:30am',  type: 'reel' },
          { id: 'p2', date: '2026-07-31', title: 'Trial Reel',  time: '9:30am',  type: 'reel' },
        ],
      },
      business: {
        royalties: {
          streams: [
            { id: 'r1', name: 'BMI',                type: 'Performance',        amount: 8000,  currency: 'USD', period: 'Dec 2025 statement'      },
            { id: 'r2', name: 'Defected Records',   type: 'Master',             amount: 40000, currency: 'GBP', period: 'owed now'                 },
            { id: 'r3', name: 'SoundExchange',      type: 'Digital Performance',amount: 200,   currency: 'USD', period: 'Jun 2026 statement'       },
            { id: 'r4', name: 'The MLC',            type: 'Mechanical',         amount: 5000,  currency: 'USD', period: 'owed now'                 },
            { id: 'r5', name: 'Warner Music Group', type: 'Master',             amount: 4000,  currency: 'USD', period: 'Jul–Dec 2025 statement'   },
          ],
        },
        banking: {
          deposits: [
            { id: 'd1', name: 'Sync Licensing Co.',  date: '2026-06-29', amount: 200000, currency: 'USD', mgmt: 0.10, lawyer: 0.025, taxes: 0.15, done: false },
            { id: 'd2', name: 'SOUNDEXCHANGE',       date: '2026-06-18', amount: 500,    currency: 'USD', mgmt: 0.20, lawyer: 0.060, taxes: 0.40, done: false },
            { id: 'd3', name: 'Invoice Payment',     date: '2026-06-16', amount: 50000,  currency: 'USD', mgmt: 0.18, lawyer: 0.060, taxes: 0.40, done: false },
            { id: 'd4', name: 'Atlantic Recording',  date: '2026-06-01', amount: 7000,   currency: 'USD', mgmt: 0.20, lawyer: 0.040, taxes: 0.15, done: true  },
            { id: 'd5', name: 'BMI ROYALTY DIST',    date: '2026-05-21', amount: 20000,  currency: 'USD', mgmt: 0.20, lawyer: 0.050, taxes: 0.30, done: true  },
          ],
        },
        catalog: {
          works: [
            { id: 'w1', title: 'Where You Been',                   ipi: '#70885280', writers: 'Mascolo Eric',        amount: 20000, currency: 'USD', bmi: 'ok', mlc: 'q', sx: 'ok',   ppl: 'warn' },
            { id: 'w2', title: 'Good Nights feat. Mascolo',                          writers: 'Mascolo Eric 50%',    amount: 20000, currency: 'USD', bmi: 'ok', mlc: 'q', sx: 'ok',   ppl: 'no'   },
            { id: 'w3', title: "Can't Let You Go feat. LITTLEJET",                   writers: 'Mascolo Eric 38.26%', amount: 20000, currency: 'USD', bmi: 'ok', mlc: 'q', sx: 'ok',   ppl: 'no'   },
            { id: 'w4', title: 'FEEL',                                               writers: 'Mascolo Eric 33.34%', amount: 3000,  currency: 'USD', bmi: 'ok', mlc: 'q', sx: 'no',   ppl: 'no'   },
            { id: 'w5', title: 'Falling',                                            writers: 'Mascolo Eric 35%',    amount: 3000,  currency: 'USD', bmi: 'ok', mlc: 'q', sx: 'ok',   ppl: 'no'   },
            { id: 'w6', title: 'YOU ARE',                                            writers: 'Mascolo Eric 20%',    amount: 2000,  currency: 'USD', bmi: 'ok', mlc: 'q', sx: 'no',   ppl: 'no'   },
            { id: 'w7', title: 'Pick Me Up',                       ipi: '#69299870', writers: 'Mascolo Eric 45%',   amount: 2000,  currency: 'GBP', bmi: 'ok', mlc: 'q', sx: 'warn', ppl: 'warn' },
          ],
        },
      },
      analytics:  MASCOLO_ANALYTICS,
      fandom:     MASCOLO_FANDOM,
      agentData:  MASCOLO_AGENT,
      legal:      MASCOLO_LEGAL,
      finance:    MASCOLO_FINANCE,
      projects: [
        { id: 'mp1', title: 'Mascolo 2026 album rollout', type: 'release',    status: 'in-progress', assignee: 'PH', dueDate: '2026-09-01', createdAt: '2026-07-01', fromArtist: false },
        { id: 'mp2', title: 'Brooklyn Mirage advancing',  type: 'show',       status: 'in-progress', assignee: 'MS', dueDate: '2026-09-05', createdAt: '2026-07-10', fromArtist: false },
        { id: 'mp3', title: 'Brand deal — Red Bull',      type: 'brand-deal', status: 'review',      assignee: 'GC', dueDate: '2026-08-15', createdAt: '2026-07-15', fromArtist: false },
        { id: 'mp4', title: 'Can I get a press release?', type: 'content',    status: 'submitted',   assignee: undefined, dueDate: undefined, createdAt: '2026-07-20', fromArtist: true  },
      ],
      artistTodos: [
        { id: 'mt1', title: 'Approve mix for "Long Time"',   done: false, dueDate: '2026-08-05', createdAt: '2026-07-25' },
        { id: 'mt2', title: 'Review Brooklyn Mirage setlist', done: false, dueDate: '2026-08-20', createdAt: '2026-07-25' },
        { id: 'mt3', title: 'Record voice memo for Outro',   done: true,  createdAt: '2026-07-20' },
      ],
    },

    {
      id: 'nimino',
      name: 'nimino',
      genre: 'Indie / Electronic',
      color: '#8b5cf6',
      songs: {
        albums: [{
          id: 'a2',
          title: 'debut EP',
          tracks: [
            { id: 'n1', num: 1, title: 'Overgrown',     stage: 'master', version: 12, touched: '3d', labelCopy: { isrc: 'GBUM72600011', writers: 'nimino', pro: 'PRS', duration: '3:41' } },
            { id: 'n2', num: 2, title: 'Yellow Light',  stage: 'master', version: 9,  touched: '3d', labelCopy: { isrc: 'GBUM72600012', writers: 'nimino', pro: 'PRS', duration: '3:12' } },
            { id: 'n3', num: 3, title: 'Second Guess',  stage: 'mix',    version: 5,  touched: '5d'  },
            { id: 'n4', num: 4, title: 'Passenger',     stage: 'mix',    version: 4,  touched: '5d'  },
            { id: 'n5', num: 5, title: 'Still Here',    stage: 'track',  version: 2,  touched: '9d'  },
            { id: 'n6', num: 6, title: 'Home Run',      stage: 'track',  version: 1,  touched: '14d' },
          ],
          labelCopy: { label: 'Independent', primaryArtist: 'nimino', genre: 'Indie / Electronic' },
          checklist: defaultChecklist().map(i => ['isrc'].includes(i.key) ? { ...i, done: true } : i),
        }],
      },
      tour: NIMINO_TOUR,
      content: {
        posts: [
          { id: 'np1', date: '2026-08-02', title: 'Studio Update',    time: '10:00am', type: 'reel'  },
          { id: 'np2', date: '2026-08-05', title: 'Behind The Song',  time: '2:00pm',  type: 'story' },
          { id: 'np3', date: '2026-08-09', title: 'Snippet #1',       time: '11:00am', type: 'reel'  },
        ],
      },
      business: {
        royalties: {
          streams: [
            { id: 'nr1', name: 'Defected Records', type: 'Master',             amount: 40000, currency: 'GBP', period: 'owed now'          },
            { id: 'nr2', name: 'BMI',              type: 'Performance',        amount: 3200,  currency: 'USD', period: 'Q1 2026 statement'  },
            { id: 'nr3', name: 'SoundExchange',    type: 'Digital Performance',amount: 800,   currency: 'USD', period: 'Jun 2026'           },
          ],
        },
        banking: {
          deposits: [
            { id: 'nd1', name: 'Defected Advance', date: '2026-07-01', amount: 60000, currency: 'GBP', mgmt: 0.15, lawyer: 0.05, taxes: 0.30, done: false },
            { id: 'nd2', name: 'Sync · Netflix',   date: '2026-05-15', amount: 12000, currency: 'USD', mgmt: 0.20, lawyer: 0.05, taxes: 0.30, done: true  },
          ],
        },
        catalog: {
          works: [
            { id: 'nw1', title: 'Overgrown',     writers: 'nimino 100%', amount: 3200, currency: 'USD', bmi: 'ok', mlc: 'ok', sx: 'ok',   ppl: 'ok' },
            { id: 'nw2', title: 'Yellow Light',  writers: 'nimino 100%', amount: 1800, currency: 'USD', bmi: 'ok', mlc: 'ok', sx: 'ok',   ppl: 'no' },
            { id: 'nw3', title: 'Second Guess',  writers: 'nimino 100%', amount: 600,  currency: 'USD', bmi: 'ok', mlc: 'q',  sx: 'warn', ppl: 'no' },
            { id: 'nw4', title: 'Passenger',     writers: 'nimino 100%', amount: 200,  currency: 'USD', bmi: 'ok', mlc: 'q',  sx: 'no',   ppl: 'no' },
          ],
        },
      },
      analytics:  NIMINO_ANALYTICS,
      fandom:     NIMINO_FANDOM,
      agentData:  NIMINO_AGENT,
      legal:      NIMINO_LEGAL,
      finance:    NIMINO_FINANCE,
      projects: [
        { id: 'np1', title: 'Debut EP release plan',     type: 'release', status: 'in-progress', assignee: 'EB', dueDate: '2026-08-10', createdAt: '2026-07-01', fromArtist: false },
        { id: 'np2', title: 'London show advancing',     type: 'show',    status: 'review',      assignee: 'MS', dueDate: '2026-08-10', createdAt: '2026-07-10', fromArtist: false },
        { id: 'np3', title: 'Need press photos ASAP',    type: 'content', status: 'submitted',   assignee: undefined, dueDate: undefined, createdAt: '2026-07-22', fromArtist: true  },
      ],
      artistTodos: [
        { id: 'nt1', title: 'Approve Overgrown master',    done: false, dueDate: '2026-08-06', createdAt: '2026-07-25' },
        { id: 'nt2', title: 'Send updated rider to London', done: false, dueDate: '2026-08-08', createdAt: '2026-07-25' },
        { id: 'nt3', title: 'Review press photo selects',  done: false, createdAt: '2026-07-26' },
      ],
    },

    {
      id: 'sierra',
      name: 'Sierra Bloom',
      genre: 'Singer-Songwriter',
      color: '#ec4899',
      songs: {
        albums: [{
          id: 'a3',
          title: 'Debut Singles',
          tracks: [
            { id: 'si1', num: 1, title: 'Golden Hour',  stage: 'done',   version: 18, touched: '2d', labelCopy: { isrc: 'USRC12600031', writers: 'S. Bloom', pro: 'ASCAP', duration: '3:07' } },
            { id: 'si2', num: 2, title: 'Wildfire',     stage: 'master', version: 7,  touched: '6d'  },
            { id: 'si3', num: 3, title: 'Paper Planes', stage: 'mix',    version: 3,  touched: '8d'  },
            { id: 'si4', num: 4, title: 'Quiet Storm',  stage: 'track',  version: 1,  touched: '15d' },
          ],
          labelCopy: { label: 'Independent', primaryArtist: 'Sierra Bloom', genre: 'Singer-Songwriter' },
          checklist: defaultChecklist().map(i => ['masters', 'isrc'].includes(i.key) ? { ...i, done: true } : i),
        }],
      },
      tour: SIERRA_TOUR,
      content: {
        posts: [
          { id: 'sp1', date: '2026-08-04', title: 'Golden Hour lyric clip', time: '12:00pm', type: 'reel' },
        ],
      },
      business: {
        royalties: {
          streams: [
            { id: 'sr1', name: 'BMI',                   type: 'Performance', amount: 1200, currency: 'USD', period: 'Q1 2026 statement' },
            { id: 'sr2', name: 'DistroKid / Streaming', type: 'Master',      amount: 340,  currency: 'USD', period: 'May 2026'          },
          ],
        },
        banking: {
          deposits: [
            { id: 'sd1', name: 'Sync · Spotify', date: '2026-07-10', amount: 5000, currency: 'USD', mgmt: 0.15, lawyer: 0.04, taxes: 0.25, done: false },
          ],
        },
        catalog: {
          works: [
            { id: 'sw1', title: 'Golden Hour',  writers: 'Sierra Bloom 100%', amount: 1200, currency: 'USD', bmi: 'ok',   mlc: 'ok', sx: 'ok', ppl: 'no' },
            { id: 'sw2', title: 'Wildfire',     writers: 'Sierra Bloom 100%', amount: 340,  currency: 'USD', bmi: 'ok',   mlc: 'q',  sx: 'no', ppl: 'no' },
            { id: 'sw3', title: 'Paper Planes', writers: 'Sierra Bloom 100%', amount: 0,    currency: 'USD', bmi: 'warn', mlc: 'q',  sx: 'no', ppl: 'no' },
          ],
        },
      },
      analytics:  SIERRA_ANALYTICS,
      fandom:     SIERRA_FANDOM,
      agentData:  SIERRA_AGENT,
      legal:      SIERRA_LEGAL,
      finance:    SIERRA_FINANCE,
      projects: [
        { id: 'sp1', title: 'Golden Hour rollout',     type: 'release', status: 'done',      assignee: 'PH', dueDate: '2026-08-04', createdAt: '2026-07-01', fromArtist: false },
        { id: 'sp2', title: 'Festival booking push',   type: 'show',    status: 'submitted', assignee: undefined, dueDate: undefined, createdAt: '2026-07-28', fromArtist: true  },
      ],
      artistTodos: [
        { id: 'st1', title: 'Approve Wildfire cover art', done: false, dueDate: '2026-08-07', createdAt: '2026-07-25' },
        { id: 'st2', title: 'Record acoustic version of Golden Hour', done: true, createdAt: '2026-07-20' },
      ],
    },
  ],
}
