// The artist profile's fields: what is open to the team, and what is private (hidden until revealed, and every
// reveal is recorded). Shared by the screens and the server routes, so both agree on exactly which fields exist.

// ── Open details ─────────────────────────────────────────────
export const SOCIAL_FIELDS = [
  ['instagram', 'Instagram'], ['tiktok', 'TikTok'], ['twitter', 'X / Twitter'], ['youtube', 'YouTube'],
  ['facebook', 'Facebook'], ['spotify', 'Spotify'], ['appleMusic', 'Apple Music'], ['soundcloud', 'SoundCloud'],
  ['bandcamp', 'Bandcamp'], ['other', 'Other link'],
] as const
export type SocialKey = (typeof SOCIAL_FIELDS)[number][0]

export const SIZE_FIELDS = [
  ['shirt', 'Shirt'], ['jacket', 'Jacket'], ['jeans', 'Jeans'], ['pants', 'Pants'], ['shoe', 'Shoe'],
] as const
export type SizeKey = (typeof SIZE_FIELDS)[number][0]

export const SEAT_OPTIONS = ['', 'Window', 'Aisle', 'Middle', 'No preference'] as const

// ── Private details ──────────────────────────────────────────
export interface PrivateField { key: string; label: string; multiline?: boolean; hint?: string; artistOnly?: boolean }
export interface PrivateGroup { key: string; label: string; fields: PrivateField[] }

export const PRIVATE_GROUPS: PrivateGroup[] = [
  { key: 'identity', label: 'Identity', fields: [
    { key: 'dob', label: 'Date of birth', hint: 'MM/DD/YYYY' },
    { key: 'birthplace', label: 'Place of birth' },
    { key: 'birthCountry', label: 'Country of birth' },
    { key: 'citizenship', label: 'Citizenship' },
    { key: 'homeAddress', label: 'Home address', multiline: true },
  ] },
  { key: 'business', label: 'Business', fields: [
    { key: 'taxId', label: 'Company tax ID', hint: 'EIN or equivalent', artistOnly: true },
  ] },
  { key: 'travelIds', label: 'Travel IDs', fields: [
    { key: 'ktn', label: 'TSA PreCheck / Known Traveler #' },
    { key: 'ff_alaska', label: 'Alaska' }, { key: 'ff_aeroplan', label: 'Aeroplan' }, { key: 'ff_american', label: 'American' },
    { key: 'ff_delta', label: 'Delta' }, { key: 'ff_jetblue', label: 'JetBlue' }, { key: 'ff_southwest', label: 'Southwest' },
    { key: 'ff_united', label: 'United' }, { key: 'ff_other', label: 'Other airline numbers', multiline: true },
    { key: 'hotelLoyalty', label: 'Hotel rewards numbers', multiline: true },
    { key: 'aaa', label: 'AAA #' },
  ] },
  { key: 'health', label: 'Health and emergency contact', fields: [
    { key: 'conditions', label: 'Medical conditions', multiline: true },
    { key: 'allergies', label: 'Allergies', multiline: true },
    { key: 'emergencyName', label: 'Emergency contact' },
    { key: 'emergencyRelation', label: 'Relationship' },
    { key: 'emergencyPhone', label: 'Emergency phone' },
    { key: 'emergencyEmail', label: 'Emergency email' },
  ] },
]

/** The private fields that apply to this kind of subject (the tax ID only exists for the artist). */
export function privateGroupsFor(subject: string): PrivateGroup[] {
  return PRIVATE_GROUPS
    .map(g => ({ ...g, fields: g.fields.filter(f => subject === 'artist' || !f.artistOnly) }))
    .filter(g => g.fields.length > 0)
}

export function privateKeysFor(subject: string): Set<string> {
  return new Set(privateGroupsFor(subject).flatMap(g => g.fields.map(f => f.key)))
}

export const MAX_FIELD_CHARS = 1000
