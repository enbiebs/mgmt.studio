// ──────────────────────────────────────────────────────────
//  Studio · Analytics Demo Data
//  Realistic Chartmetric-style data for the three demo artists.
//  Replace with live Chartmetric API calls when you integrate.
// ──────────────────────────────────────────────────────────

import type { AnalyticsData, DataPoint } from '@/types'

// ── Helper: generate 30-day trend ──────────────────────────
function trend(base: number, variance: number, direction: 'up' | 'flat' | 'spike' = 'up'): DataPoint[] {
  const out: DataPoint[] = []
  const start = new Date('2026-07-04')
  let val = base
  for (let i = 0; i < 30; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const jitter = (Math.random() - 0.5) * variance
    if (direction === 'up')   val = val * 1.008 + jitter
    if (direction === 'flat') val = base + jitter
    if (direction === 'spike' && i === 18) val = base * 3.2   // sudden viral spike
    if (direction === 'spike' && i > 18)   val = val * 0.92 + jitter
    out.push({ date: d.toISOString().slice(0, 10), value: Math.round(Math.max(0, val)) })
  }
  return out
}

// ── Empty analytics (for new clients) ──────────────────────
export const EMPTY_ANALYTICS: AnalyticsData = {
  chartmetricScore: 0, chartmetricScoreDelta: 0, momentumScore: 0,
  followers: { spotify: 0, instagram: 0, tiktok: 0, youtube: 0, facebook: 0, twitter: 0 },
  followersDelta: { spotify: 0, instagram: 0, tiktok: 0, youtube: 0, facebook: 0, twitter: 0 },
  streaming: { monthlyListeners: 0, monthlyListenersDelta: 0, monthlyListenersPct: 0, totalStreams: 0, saveEstimate: 0, playlistCount: 0, playlistCountDelta: 0, dailyStreams: [], dspBreakdown: [] },
  playlists: [], social: [],
  tiktok: { sounds: 0, ugcVideos: 0, totalViews: 0, weeklyTrend: [], topCreators: [], geoSpread: [], chartPeak: 0 },
  audience: { topCountries: [], topCities: [], age: [], gender: [] },
  charts: [], shazamTotal: 0, shazamDaily: [],
}

// ── MASCOLO ────────────────────────────────────────────────
export const MASCOLO_ANALYTICS: AnalyticsData = {
  chartmetricScore:      87.4,
  chartmetricScoreDelta: 2.1,
  momentumScore:         74,

  followers: {
    spotify:   184000,
    instagram: 62400,
    tiktok:    38200,
    youtube:   21000,
    facebook:  9800,
    twitter:   5100,
  },
  followersDelta: {
    spotify:   4200,
    instagram: 1800,
    tiktok:    3100,
    youtube:   620,
    facebook:  80,
    twitter:   -40,
  },

  streaming: {
    monthlyListeners:      1_840_000,
    monthlyListenersDelta: 220_000,
    monthlyListenersPct:   13.6,
    totalStreams:          24_600_000,
    saveEstimate:          186_000,
    playlistCount:         318,
    playlistCountDelta:    22,
    dailyStreams: trend(58000, 8000, 'up'),
    dspBreakdown: [
      { name: 'Spotify',       streams: 13_400_000, pct: 54.5 },
      { name: 'Apple Music',   streams: 4_900_000,  pct: 19.9 },
      { name: 'YouTube Music', streams: 3_100_000,  pct: 12.6 },
      { name: 'Amazon Music',  streams: 1_800_000,  pct: 7.3  },
      { name: 'Deezer',        streams: 900_000,    pct: 3.7  },
      { name: 'TIDAL',         streams: 500_000,    pct: 2.0  },
    ],
  },

  playlists: [
    { id: 'pl1',  trackTitle: 'Long Time',     name: 'Mint',                    platform: 'Spotify',      followers: 4_200_000, position: 14, dateAdded: '2026-07-02', type: 'editorial',   curator: 'Spotify Editorial', movement: 'up',   movementAmt: 3  },
    { id: 'pl2',  trackTitle: 'Long Time',     name: 'Electronic Rising',        platform: 'Spotify',      followers: 890_000,   position: 2,  dateAdded: '2026-07-08', type: 'editorial',   curator: 'Spotify Editorial', movement: 'new',  movementAmt: 0  },
    { id: 'pl3',  trackTitle: 'All Of My Love',name: 'Hot Hits UK',             platform: 'Spotify',      followers: 1_600_000, position: 31, dateAdded: '2026-06-18', type: 'editorial',   curator: 'Spotify Editorial', movement: 'same', movementAmt: 0  },
    { id: 'pl4',  trackTitle: 'Nobody Else',   name: 'New Music Friday',        platform: 'Apple Music',  followers: 3_100_000, position: 6,  dateAdded: '2026-07-12', type: 'editorial',   curator: 'Apple Music',       movement: 'up',   movementAmt: 5  },
    { id: 'pl5',  trackTitle: 'Long Time',     name: 'Deep Focus',              platform: 'Spotify',      followers: 6_800_000, position: 43, dateAdded: '2026-06-01', type: 'algorithmic', curator: 'Spotify',           movement: 'down', movementAmt: 2  },
    { id: 'pl6',  trackTitle: 'Fade Away',     name: 'Dance Hits 2026',         platform: 'YouTube Music',followers: 220_000,   position: 8,  dateAdded: '2026-07-15', type: 'editorial',   curator: 'YouTube Music',     movement: 'new',  movementAmt: 0  },
    { id: 'pl7',  trackTitle: 'Long Time',     name: 'House Party Classics',    platform: 'Spotify',      followers: 340_000,   position: 12, dateAdded: '2026-05-20', type: 'user',        curator: 'houseparty_uk',     movement: 'same', movementAmt: 0  },
    { id: 'pl8',  trackTitle: 'CTMH',          name: 'Electronic Essentials',   platform: 'Apple Music',  followers: 780_000,   position: 19, dateAdded: '2026-07-01', type: 'editorial',   curator: 'Apple Music',       movement: 'up',   movementAmt: 4  },
  ],

  social: [
    { platform: 'Instagram', icon: '📷', followers: 62400,  followersDelta: 1800,  engagementRate: 4.2, weeklyGrowth: trend(62000, 200, 'up').slice(-7),  topPost: 'Brooklyn Mirage announcement — 48K reach' },
    { platform: 'TikTok',    icon: '🎵', followers: 38200,  followersDelta: 3100,  engagementRate: 7.8, weeklyGrowth: trend(35000, 400, 'up').slice(-7),  topPost: '"Long Time" snippet — 280K views' },
    { platform: 'YouTube',   icon: '▶️', followers: 21000,  followersDelta: 620,   engagementRate: 3.1, weeklyGrowth: trend(20400, 100, 'up').slice(-7),  topPost: 'Long Time (Official Video) — 1.2M views' },
    { platform: 'X',         icon: '𝕏',  followers: 5100,   followersDelta: -40,   engagementRate: 0.9, weeklyGrowth: trend(5140, 30, 'flat').slice(-7),  topPost: undefined },
    { platform: 'Facebook',  icon: '👤', followers: 9800,   followersDelta: 80,    engagementRate: 1.4, weeklyGrowth: trend(9720, 40, 'flat').slice(-7),  topPost: undefined },
  ],

  tiktok: {
    sounds:    1,
    ugcVideos: 4_200,
    totalViews: 18_600_000,
    weeklyTrend: trend(280000, 40000, 'spike'),
    chartPeak: 38,
    topCreators: [
      { handle: '@dj_sets_uk',     videos: 142, views: 2_100_000 },
      { handle: '@housemusicdaily', videos: 89,  views: 1_400_000 },
      { handle: '@electronicvibes', videos: 61,  views: 890_000   },
      { handle: '@clubnightlondon', videos: 44,  views: 560_000   },
      { handle: '@ravearchive',     videos: 38,  views: 420_000   },
    ],
    geoSpread: [
      { country: 'United Kingdom', pct: 34 },
      { country: 'United States',  pct: 22 },
      { country: 'Germany',        pct: 12 },
      { country: 'Australia',      pct: 8  },
      { country: 'Netherlands',    pct: 6  },
      { country: 'Other',          pct: 18 },
    ],
  },

  audience: {
    topCountries: [
      { name: 'United Kingdom', code: 'GB', pct: 28 },
      { name: 'United States',  code: 'US', pct: 24 },
      { name: 'Germany',        code: 'DE', pct: 11 },
      { name: 'Australia',      code: 'AU', pct: 7  },
      { name: 'Netherlands',    code: 'NL', pct: 6  },
      { name: 'Canada',         code: 'CA', pct: 5  },
      { name: 'France',         code: 'FR', pct: 4  },
    ],
    topCities: [
      { name: 'London',         country: 'UK',  pct: 12 },
      { name: 'New York',       country: 'US',  pct: 8  },
      { name: 'Berlin',         country: 'DE',  pct: 7  },
      { name: 'Los Angeles',    country: 'US',  pct: 5  },
      { name: 'Sydney',         country: 'AU',  pct: 4  },
      { name: 'Amsterdam',      country: 'NL',  pct: 4  },
      { name: 'Manchester',     country: 'UK',  pct: 3  },
    ],
    age: [
      { range: '18–24', pct: 28 },
      { range: '25–34', pct: 42 },
      { range: '35–44', pct: 18 },
      { range: '45+',   pct: 12 },
    ],
    gender: [
      { label: 'Male',   pct: 64 },
      { label: 'Female', pct: 33 },
      { label: 'Other',  pct: 3  },
    ],
  },

  charts: [
    { id: 'c1', platform: 'Spotify',     chartName: 'Viral 50',          country: 'United Kingdom', position: 12, peak: 8,  entered: '2026-07-08', movement: 'up',   movementAmt: 3  },
    { id: 'c2', platform: 'Spotify',     chartName: 'Viral 50',          country: 'Netherlands',    position: 4,  peak: 4,  entered: '2026-07-10', movement: 'same', movementAmt: 0  },
    { id: 'c3', platform: 'Spotify',     chartName: 'Top 200',           country: 'Australia',      position: 88, peak: 72, entered: '2026-06-28', movement: 'down', movementAmt: 6  },
    { id: 'c4', platform: 'Apple Music', chartName: 'Top 100 Electronic',country: 'United Kingdom', position: 6,  peak: 3,  entered: '2026-07-12', movement: 'up',   movementAmt: 4  },
    { id: 'c5', platform: 'TikTok',      chartName: 'Sound Chart',       country: 'Global',         position: 38, peak: 38, entered: '2026-07-20', movement: 'new',  movementAmt: 0  },
    { id: 'c6', platform: 'Shazam',      chartName: 'Top Shazams',       country: 'United Kingdom', position: 22, peak: 18, entered: '2026-07-05', movement: 'up',   movementAmt: 2  },
  ],

  shazamTotal: 42_800,
  shazamDaily: trend(1200, 200, 'up'),
}

// ── NIMINO ────────────────────────────────────────────────
export const NIMINO_ANALYTICS: AnalyticsData = {
  chartmetricScore:      71.2,
  chartmetricScoreDelta: 4.8,
  momentumScore:         88,   // high momentum — emerging artist growing fast

  followers: {
    spotify:   41_000,
    instagram: 22_800,
    tiktok:    91_400,
    youtube:   8_200,
    facebook:  1_400,
    twitter:   3_100,
  },
  followersDelta: {
    spotify:   6_200,
    instagram: 3_400,
    tiktok:    18_600,   // TikTok is driving this
    youtube:   1_100,
    facebook:  20,
    twitter:   210,
  },

  streaming: {
    monthlyListeners:      380_000,
    monthlyListenersDelta: 98_000,
    monthlyListenersPct:   34.7,
    totalStreams:          4_200_000,
    saveEstimate:          62_000,
    playlistCount:         94,
    playlistCountDelta:    31,
    dailyStreams: trend(12000, 3000, 'spike'),
    dspBreakdown: [
      { name: 'Spotify',       streams: 2_200_000, pct: 52.4 },
      { name: 'Apple Music',   streams: 780_000,   pct: 18.6 },
      { name: 'YouTube Music', streams: 490_000,   pct: 11.7 },
      { name: 'Amazon Music',  streams: 380_000,   pct: 9.0  },
      { name: 'Deezer',        streams: 220_000,   pct: 5.2  },
      { name: 'TIDAL',         streams: 130_000,   pct: 3.1  },
    ],
  },

  playlists: [
    { id: 'npl1', trackTitle: 'Overgrown',    name: 'Fresh Finds',            platform: 'Spotify',     followers: 540_000,   position: 3,  dateAdded: '2026-07-18', type: 'editorial',   curator: 'Spotify Editorial', movement: 'new',  movementAmt: 0 },
    { id: 'npl2', trackTitle: 'Overgrown',    name: 'Indie Electronic',       platform: 'Spotify',     followers: 1_100_000, position: 18, dateAdded: '2026-07-15', type: 'editorial',   curator: 'Spotify Editorial', movement: 'up',   movementAmt: 7 },
    { id: 'npl3', trackTitle: 'Yellow Light', name: 'New Music Friday UK',    platform: 'Spotify',     followers: 2_400_000, position: 44, dateAdded: '2026-07-05', type: 'editorial',   curator: 'Spotify Editorial', movement: 'down', movementAmt: 3 },
    { id: 'npl4', trackTitle: 'Overgrown',    name: 'Breaking Electronic',    platform: 'Apple Music', followers: 310_000,   position: 7,  dateAdded: '2026-07-20', type: 'editorial',   curator: 'Apple Music',       movement: 'new',  movementAmt: 0 },
    { id: 'npl5', trackTitle: 'Passenger',    name: 'Sad Bops',               platform: 'Spotify',     followers: 980_000,   position: 22, dateAdded: '2026-06-25', type: 'algorithmic', curator: 'Spotify',           movement: 'up',   movementAmt: 4 },
  ],

  social: [
    { platform: 'TikTok',    icon: '🎵', followers: 91400,  followersDelta: 18600, engagementRate: 12.4, weeklyGrowth: trend(73000, 800, 'up').slice(-7),   topPost: '"Overgrown" stitch trend — 4.2M views' },
    { platform: 'Instagram', icon: '📷', followers: 22800,  followersDelta: 3400,  engagementRate: 6.8,  weeklyGrowth: trend(19400, 180, 'up').slice(-7),   topPost: 'Studio session BTS — 82K reach' },
    { platform: 'YouTube',   icon: '▶️', followers: 8200,   followersDelta: 1100,  engagementRate: 4.2,  weeklyGrowth: trend(7100, 80, 'up').slice(-7),     topPost: 'Overgrown (Official Audio) — 680K views' },
    { platform: 'X',         icon: '𝕏',  followers: 3100,   followersDelta: 210,   engagementRate: 2.1,  weeklyGrowth: trend(2890, 30, 'up').slice(-7),     topPost: undefined },
  ],

  tiktok: {
    sounds:     1,
    ugcVideos:  22_400,
    totalViews: 86_200_000,
    weeklyTrend: trend(2800000, 400000, 'spike'),
    chartPeak: 12,
    topCreators: [
      { handle: '@sadboyvibe',      videos: 844,  views: 12_100_000 },
      { handle: '@indiekid_uk',     videos: 612,  views: 8_800_000  },
      { handle: '@aestheticwave',   videos: 481,  views: 7_200_000  },
      { handle: '@lofi_hours',      videos: 340,  views: 4_400_000  },
      { handle: '@studyplaylist',   videos: 290,  views: 3_800_000  },
    ],
    geoSpread: [
      { country: 'United States',   pct: 38 },
      { country: 'United Kingdom',  pct: 16 },
      { country: 'Australia',       pct: 10 },
      { country: 'Canada',          pct: 8  },
      { country: 'Germany',         pct: 6  },
      { country: 'Other',           pct: 22 },
    ],
  },

  audience: {
    topCountries: [
      { name: 'United States',  code: 'US', pct: 36 },
      { name: 'United Kingdom', code: 'GB', pct: 18 },
      { name: 'Australia',      code: 'AU', pct: 10 },
      { name: 'Canada',         code: 'CA', pct: 8  },
      { name: 'Germany',        code: 'DE', pct: 5  },
      { name: 'Netherlands',    code: 'NL', pct: 4  },
    ],
    topCities: [
      { name: 'Los Angeles',    country: 'US', pct: 10 },
      { name: 'London',         country: 'UK', pct: 8  },
      { name: 'New York',       country: 'US', pct: 7  },
      { name: 'Sydney',         country: 'AU', pct: 5  },
      { name: 'Toronto',        country: 'CA', pct: 4  },
    ],
    age: [
      { range: '13–17', pct: 18 },
      { range: '18–24', pct: 44 },
      { range: '25–34', pct: 28 },
      { range: '35+',   pct: 10 },
    ],
    gender: [
      { label: 'Female', pct: 58 },
      { label: 'Male',   pct: 38 },
      { label: 'Other',  pct: 4  },
    ],
  },

  charts: [
    { id: 'nc1', platform: 'Spotify',  chartName: 'Viral 50',        country: 'United States',  position: 8,  peak: 6,  entered: '2026-07-20', movement: 'up',   movementAmt: 4 },
    { id: 'nc2', platform: 'Spotify',  chartName: 'Viral 50',        country: 'United Kingdom', position: 14, peak: 14, entered: '2026-07-22', movement: 'new',  movementAmt: 0 },
    { id: 'nc3', platform: 'TikTok',   chartName: 'Sound Chart',     country: 'Global',         position: 12, peak: 9,  entered: '2026-07-16', movement: 'down', movementAmt: 3 },
    { id: 'nc4', platform: 'Shazam',   chartName: 'Top Shazams',     country: 'Australia',      position: 18, peak: 18, entered: '2026-07-25', movement: 'new',  movementAmt: 0 },
  ],

  shazamTotal: 18_200,
  shazamDaily: trend(480, 80, 'spike'),
}

// ── SIERRA BLOOM ───────────────────────────────────────────
export const SIERRA_ANALYTICS: AnalyticsData = {
  chartmetricScore:      58.6,
  chartmetricScoreDelta: 6.2,
  momentumScore:         91,   // very high momentum — early-stage breakout

  followers: {
    spotify:   12_400,
    instagram: 18_200,
    tiktok:    44_800,
    youtube:   3_100,
    facebook:  800,
    twitter:   1_200,
  },
  followersDelta: {
    spotify:   3_800,
    instagram: 4_200,
    tiktok:    14_200,
    youtube:   680,
    facebook:  40,
    twitter:   190,
  },

  streaming: {
    monthlyListeners:      94_000,
    monthlyListenersDelta: 38_000,
    monthlyListenersPct:   68.1,
    totalStreams:          820_000,
    saveEstimate:          24_000,
    playlistCount:         41,
    playlistCountDelta:    18,
    dailyStreams: trend(2800, 600, 'spike'),
    dspBreakdown: [
      { name: 'Spotify',       streams: 420_000, pct: 51.2 },
      { name: 'Apple Music',   streams: 160_000, pct: 19.5 },
      { name: 'YouTube Music', streams: 110_000, pct: 13.4 },
      { name: 'Amazon Music',  streams: 80_000,  pct: 9.8  },
      { name: 'Deezer',        streams: 30_000,  pct: 3.7  },
      { name: 'TIDAL',         streams: 20_000,  pct: 2.4  },
    ],
  },

  playlists: [
    { id: 'spl1', trackTitle: 'Golden Hour', name: 'Bedroom Pop',         platform: 'Spotify',     followers: 1_800_000, position: 9,  dateAdded: '2026-07-28', type: 'editorial',   curator: 'Spotify Editorial', movement: 'new',  movementAmt: 0 },
    { id: 'spl2', trackTitle: 'Golden Hour', name: 'Fresh Finds Pop',     platform: 'Spotify',     followers: 240_000,   position: 4,  dateAdded: '2026-07-25', type: 'editorial',   curator: 'Spotify Editorial', movement: 'up',   movementAmt: 6 },
    { id: 'spl3', trackTitle: 'Golden Hour', name: 'Today at Apple',      platform: 'Apple Music', followers: 420_000,   position: 11, dateAdded: '2026-07-30', type: 'editorial',   curator: 'Apple Music',       movement: 'new',  movementAmt: 0 },
    { id: 'spl4', trackTitle: 'Golden Hour', name: 'Sad Girl Starter Pack',platform: 'Spotify',    followers: 680_000,   position: 14, dateAdded: '2026-07-20', type: 'user',        curator: 'girlbossmix',       movement: 'up',   movementAmt: 8 },
  ],

  social: [
    { platform: 'TikTok',    icon: '🎵', followers: 44800,  followersDelta: 14200, engagementRate: 16.2, weeklyGrowth: trend(30600, 600, 'up').slice(-7),  topPost: '"Golden Hour" sunset trend — 8.4M views' },
    { platform: 'Instagram', icon: '📷', followers: 18200,  followersDelta: 4200,  engagementRate: 8.4,  weeklyGrowth: trend(14000, 200, 'up').slice(-7),  topPost: 'Song lyric graphic — 140K reach' },
    { platform: 'YouTube',   icon: '▶️', followers: 3100,   followersDelta: 680,   engagementRate: 5.2,  weeklyGrowth: trend(2420, 40, 'up').slice(-7),    topPost: 'Golden Hour (Official Lyric Video) — 220K views' },
    { platform: 'X',         icon: '𝕏',  followers: 1200,   followersDelta: 190,   engagementRate: 3.8,  weeklyGrowth: trend(1010, 20, 'up').slice(-7),    topPost: undefined },
  ],

  tiktok: {
    sounds:     1,
    ugcVideos:  38_600,
    totalViews: 142_000_000,
    weeklyTrend: trend(5200000, 800000, 'spike'),
    chartPeak: 4,
    topCreators: [
      { handle: '@goldenhourgirls',  videos: 2140,  views: 28_000_000 },
      { handle: '@sunsetvibes_',     videos: 1620,  views: 18_400_000 },
      { handle: '@aestheticmornin',  videos: 980,   views: 11_200_000 },
      { handle: '@coffeeshopsounds', videos: 742,   views: 8_800_000  },
      { handle: '@dreamy.sounds',    videos: 618,   views: 6_200_000  },
    ],
    geoSpread: [
      { country: 'United States',   pct: 48 },
      { country: 'United Kingdom',  pct: 14 },
      { country: 'Canada',          pct: 10 },
      { country: 'Australia',       pct: 8  },
      { country: 'Philippines',     pct: 4  },
      { country: 'Other',           pct: 16 },
    ],
  },

  audience: {
    topCountries: [
      { name: 'United States',  code: 'US', pct: 48 },
      { name: 'United Kingdom', code: 'GB', pct: 12 },
      { name: 'Canada',         code: 'CA', pct: 10 },
      { name: 'Australia',      code: 'AU', pct: 8  },
      { name: 'Philippines',    code: 'PH', pct: 4  },
    ],
    topCities: [
      { name: 'Los Angeles',  country: 'US', pct: 12 },
      { name: 'New York',     country: 'US', pct: 9  },
      { name: 'London',       country: 'UK', pct: 6  },
      { name: 'Toronto',      country: 'CA', pct: 5  },
      { name: 'Chicago',      country: 'US', pct: 4  },
    ],
    age: [
      { range: '13–17', pct: 24 },
      { range: '18–24', pct: 48 },
      { range: '25–34', pct: 22 },
      { range: '35+',   pct: 6  },
    ],
    gender: [
      { label: 'Female', pct: 72 },
      { label: 'Male',   pct: 24 },
      { label: 'Other',  pct: 4  },
    ],
  },

  charts: [
    { id: 'sc1', platform: 'TikTok',  chartName: 'Sound Chart',   country: 'United States',  position: 4,  peak: 4,  entered: '2026-07-24', movement: 'new',  movementAmt: 0 },
    { id: 'sc2', platform: 'TikTok',  chartName: 'Sound Chart',   country: 'United Kingdom', position: 11, peak: 11, entered: '2026-07-26', movement: 'new',  movementAmt: 0 },
    { id: 'sc3', platform: 'Spotify', chartName: 'Viral 50',      country: 'United States',  position: 19, peak: 19, entered: '2026-07-28', movement: 'new',  movementAmt: 0 },
    { id: 'sc4', platform: 'Shazam',  chartName: 'Top Shazams',   country: 'United States',  position: 44, peak: 44, entered: '2026-07-30', movement: 'new',  movementAmt: 0 },
    { id: 'sc5', platform: 'Apple Music', chartName: 'Shazam Discovery Top 50', country: 'Global', position: 22, peak: 18, entered: '2026-07-29', movement: 'up', movementAmt: 4 },
  ],

  shazamTotal: 8_400,
  shazamDaily: trend(200, 60, 'spike'),
}
