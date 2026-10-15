// ──────────────────────────────────────────────────────────
//  The Accounts list: for each of an artist's logins, where it lives and how the team gets in.
//  It never holds a password. Pure logic (no screens, no database), so it is easy to test.
// ──────────────────────────────────────────────────────────
import type { AccountAccess, AccountTwoFactor, ArtistAccount } from '@/types'

export const CATEGORIES = [
  ['social', 'Streaming and social'], ['rights', 'Distribution and rights'], ['money', 'Money'],
  ['email', 'Email and domains'], ['merch', 'Merch and website'], ['fans', 'Promo and fans'],
  ['storage', 'Files and tools'], ['other', 'Other'],
] as const
export const categoryLabel = (key: string) => CATEGORIES.find(c => c[0] === key)?.[1] ?? 'Other'

export const ACCESS_OPTIONS: { value: AccountAccess; label: string; hint: string }[] = [
  { value: 'platform', label: 'Platform team access', hint: 'Each person signs in as themselves (the best way)' },
  { value: 'manager',  label: 'Shared password manager', hint: 'Everyone uses one shared entry' },
  { value: 'artist',   label: 'Only the artist', hint: 'The team cannot get in without them' },
  { value: 'unsorted', label: 'Not sorted yet', hint: 'No clear way in' },
]
export const ACCESS_LABEL = Object.fromEntries(ACCESS_OPTIONS.map(o => [o.value, o.label])) as Record<AccountAccess, string>

export const TWO_FACTOR_OPTIONS: { value: AccountTwoFactor; label: string }[] = [
  { value: 'app', label: 'Authenticator app' }, { value: 'key', label: 'Passkey or security key' },
  { value: 'email', label: 'Email code' }, { value: 'sms', label: 'Text message' },
  { value: 'none', label: 'None' }, { value: 'unknown', label: 'Not checked yet' },
]
export const TWO_FACTOR_LABEL = Object.fromEntries(TWO_FACTOR_OPTIONS.map(o => [o.value, o.label])) as Record<AccountTwoFactor, string>

// Suggestions for the platform field. Sign-in pages are only filled in where the address is certain.
export const PLATFORM_PRESETS: { name: string; category: string; loginUrl?: string }[] = [
  { name: 'Spotify for Artists', category: 'social', loginUrl: 'https://artists.spotify.com' },
  { name: 'Apple Music for Artists', category: 'social', loginUrl: 'https://artists.apple.com' },
  { name: 'YouTube', category: 'social', loginUrl: 'https://studio.youtube.com' },
  { name: 'Instagram', category: 'social', loginUrl: 'https://www.instagram.com' },
  { name: 'TikTok', category: 'social', loginUrl: 'https://www.tiktok.com' },
  { name: 'X / Twitter', category: 'social', loginUrl: 'https://x.com' },
  { name: 'Facebook', category: 'social', loginUrl: 'https://www.facebook.com' },
  { name: 'SoundCloud', category: 'social', loginUrl: 'https://soundcloud.com' },
  { name: 'Bandcamp', category: 'social', loginUrl: 'https://bandcamp.com' },
  { name: 'Snapchat', category: 'social' }, { name: 'Pandora AMP', category: 'social' }, { name: 'Mixcloud', category: 'social' },
  { name: 'DistroKid', category: 'rights', loginUrl: 'https://distrokid.com' },
  { name: 'BMI', category: 'rights', loginUrl: 'https://www.bmi.com' },
  { name: 'ASCAP', category: 'rights', loginUrl: 'https://www.ascap.com' },
  { name: 'SoundExchange', category: 'rights', loginUrl: 'https://www.soundexchange.com' },
  { name: 'The MLC', category: 'rights', loginUrl: 'https://www.themlc.com' },
  { name: 'Songtrust', category: 'rights', loginUrl: 'https://www.songtrust.com' },
  { name: 'Stem', category: 'money', loginUrl: 'https://stem.is' },
  { name: 'PayPal', category: 'money', loginUrl: 'https://www.paypal.com' },
  { name: 'Bookings email', category: 'email' }, { name: 'General email', category: 'email' }, { name: 'Merch email', category: 'email' },
  { name: 'Domain registrar', category: 'email' },
  { name: 'Shopify', category: 'merch', loginUrl: 'https://www.shopify.com' },
  { name: 'Squarespace', category: 'merch', loginUrl: 'https://www.squarespace.com' },
  { name: 'Mailchimp', category: 'fans', loginUrl: 'https://mailchimp.com' },
  { name: 'Laylo', category: 'fans', loginUrl: 'https://laylo.com' },
  { name: 'Bandsintown', category: 'fans', loginUrl: 'https://artists.bandsintown.com' },
  { name: 'Songkick', category: 'fans', loginUrl: 'https://www.songkick.com' },
  { name: 'Feature.fm', category: 'fans', loginUrl: 'https://feature.fm' },
  { name: 'Inflyte', category: 'fans', loginUrl: 'https://inflyte.com' },
  { name: 'Beatport', category: 'fans' }, { name: 'Giphy', category: 'fans' },
  { name: 'Dropbox', category: 'storage', loginUrl: 'https://www.dropbox.com' },
]

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Which group a platform belongs in, by name. Unknown names land in "Other". */
export function guessCategory(platform: string): string {
  const n = norm(platform)
  if (!n) return 'other'
  const exact = PLATFORM_PRESETS.find(p => norm(p.name) === n)
  if (exact) return exact.category
  const has = (...words: string[]) => words.some(w => n.includes(w))
  if (has('spotify', 'apple', 'itunes', 'amazon', 'youtube', 'instagram', 'tiktok', 'twitter', 'facebook', 'snapchat', 'soundcloud', 'mixcloud', 'pandora', 'bandcamp', 'twitch')) return 'social'
  if (has('distrokid', 'tunecore', 'cd baby', 'cdbaby', 'bmi', 'ascap', 'sesac', 'soundexchange', 'mlc', 'songtrust', 'publishing', 'distribution')) return 'rights'
  if (has('paypal', 'stem', 'bank', 'venmo', 'stripe', 'payoneer', 'wise')) return 'money'
  if (has('email', 'mail', 'domain', 'godaddy', 'namecheap', 'google workspace')) return 'email'
  if (has('shopify', 'squarespace', 'wix', 'wordpress', 'bigcartel', 'merch', 'website')) return 'merch'
  if (has('mailchimp', 'laylo', 'bandsintown', 'songkick', 'feature', 'inflyte', 'beatport', 'giphy', 'linktree', 'toneden', 'groover')) return 'fans'
  if (has('dropbox', 'drive', 'notion', 'slack', 'zoom', 'canva')) return 'storage'
  return 'other'
}

// ── What needs attention ─────────────────────────────────────
export interface AccountIssue { key: string; text: string; level: 'attention' | 'note' }
export const STALE_PASSWORD_DAYS = 365

export function accountIssues(a: ArtistAccount, todayIso: string): AccountIssue[] {
  const out: AccountIssue[] = []
  if (a.access === 'unsorted') out.push({ key: 'unsorted', level: 'attention', text: "Team access isn't set up yet" })
  if (a.access === 'artist') out.push({ key: 'artist-only', level: 'attention', text: 'Only the artist can get in' })
  if (a.access === 'manager' && !a.vaultUrl) out.push({ key: 'no-link', level: 'note', text: 'Link the shared password entry' })
  if (a.twoFactor === 'sms') out.push({ key: 'sms', level: 'attention', text: "Codes go to one person's phone. Switch to an authenticator app" })
  if (a.twoFactor === 'none') out.push({ key: 'no-2fa', level: 'attention', text: 'No second step. Turn on two-step sign-in' })
  if (a.twoFactor === 'unknown') out.push({ key: 'unknown-2fa', level: 'note', text: 'Check what protects this sign-in' })
  if (a.lastChanged) {
    const days = (Date.parse(todayIso + 'T00:00:00Z') - Date.parse(a.lastChanged + 'T00:00:00Z')) / 86_400_000
    if (days > STALE_PASSWORD_DAYS) out.push({ key: 'stale', level: 'note', text: 'Password is over a year old' })
  }
  return out
}
export const needsAttention = (a: ArtistAccount, todayIso: string) => accountIssues(a, todayIso).some(i => i.level === 'attention')

// ── Reading a sheet of logins ────────────────────────────────
// Takes the rows of a spreadsheet (a "website | username | password" tab) and returns ONLY the platform and
// the username. The password column is recognised by its heading and never read, so a password cannot end up
// in the list even by accident. This runs in the browser: the file never reaches our server.
const PLATFORM_HEADERS = new Set(['website app', 'website', 'app', 'site', 'service', 'platform', 'account', 'application', 'website or app', 'name'])
const USER_HEADERS = new Set(['usr', 'user', 'username', 'user name', 'login', 'login id', 'email', 'id', 'user id', 'email username', 'email or username'])
const PASSWORD_HEADERS = new Set(['pw', 'pass', 'password', 'pwd', 'passcode', 'pass word'])

export interface ParsedLogin { platform: string; username: string }
export interface ParsedSheet { found: boolean; hadPasswordColumn: boolean; items: ParsedLogin[] }

export function parseAccountsSheet(rows: unknown[][]): ParsedSheet {
  for (let h = 0; h < Math.min(rows.length, 8); h++) {
    const heads = (rows[h] ?? []).map(c => norm(typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    const platformCol = heads.findIndex(x => PLATFORM_HEADERS.has(x))
    if (platformCol < 0) continue
    const userCol = heads.findIndex((x, i) => i !== platformCol && USER_HEADERS.has(x))
    const hadPasswordColumn = heads.some(x => PASSWORD_HEADERS.has(x))
    if (userCol < 0 && !hadPasswordColumn) continue

    const seen = new Set<string>()
    const items: ParsedLogin[] = []
    for (const row of rows.slice(h + 1)) {
      const platform = typeof row?.[platformCol] === 'string' ? (row[platformCol] as string).trim().slice(0, 100) : ''
      if (!platform) continue
      const userRaw = userCol >= 0 ? row[userCol] : ''
      const username = typeof userRaw === 'string' ? userRaw.trim().slice(0, 200) : ''
      const key = `${platform.toLowerCase()}|${username.toLowerCase()}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push({ platform, username })
    }
    return { found: items.length > 0, hadPasswordColumn, items }
  }
  return { found: false, hadPasswordColumn: false, items: [] }
}

/** A small, forgiving CSV reader (quoted values, commas and line breaks inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(x => x !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some(x => x !== '')) rows.push(row)
  return rows
}
