// The short codes people write after a city: US states, Canadian provinces, Australian states and
// countries ("Jacksonville, FL", "Toronto, ON", "Melbourne, VIC", "Berlin, DE"). Shared by the
// matching of places by name (intelligence.ts) and the lookup of where they are (geo.ts).

export const US_STATES = 'al ak az ar ca co ct de dc fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy'.split(' ')
export const CA_PROVINCES = 'ab bc mb nb nl ns nt nu on pe qc sk yt'.split(' ')
export const AU_STATES = 'act nsw nt qld sa tas vic wa'.split(' ')

// Country names and short forms -> the ISO code the city list uses.
export const COUNTRY_CODE: Record<string, string> = {
  uk: 'GB', gb: 'GB', 'united kingdom': 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  us: 'US', usa: 'US', 'united states': 'US', 'united states of america': 'US',
  de: 'DE', germany: 'DE', deutschland: 'DE', fr: 'FR', france: 'FR', nl: 'NL', netherlands: 'NL', 'the netherlands': 'NL', holland: 'NL',
  es: 'ES', spain: 'ES', it: 'IT', italy: 'IT', be: 'BE', belgium: 'BE', at: 'AT', austria: 'AT', ch: 'CH', switzerland: 'CH',
  se: 'SE', sweden: 'SE', no: 'NO', norway: 'NO', dk: 'DK', denmark: 'DK', fi: 'FI', finland: 'FI', ie: 'IE', ireland: 'IE',
  pt: 'PT', portugal: 'PT', pl: 'PL', poland: 'PL', cz: 'CZ', czechia: 'CZ', 'czech republic': 'CZ', hu: 'HU', hungary: 'HU',
  au: 'AU', australia: 'AU', nz: 'NZ', 'new zealand': 'NZ', jp: 'JP', japan: 'JP', mx: 'MX', mexico: 'MX', ca: 'CA', canada: 'CA',
  br: 'BR', brazil: 'BR', ar: 'AR', argentina: 'AR', cl: 'CL', chile: 'CL', za: 'ZA', 'south africa': 'ZA', ae: 'AE', uae: 'AE',
  fj: 'FJ', fiji: 'FJ', gr: 'GR', greece: 'GR', hr: 'HR', croatia: 'HR', ro: 'RO', romania: 'RO', rs: 'RS', serbia: 'RS',
  tr: 'TR', turkey: 'TR', il: 'IL', israel: 'IL', cn: 'CN', china: 'CN', kr: 'KR', 'south korea': 'KR', th: 'TH', thailand: 'TH',
  sg: 'SG', singapore: 'SG', co: 'CO', colombia: 'CO', pe: 'PE', peru: 'PE', jm: 'JM', jamaica: 'JM', pr: 'PR', 'puerto rico': 'PR',
}

/** True for a short, unambiguous-looking code written after a city ("FL", "UK", "VIC"). Full names are handled by the comma form. */
export const isRegionCode = (t: string) =>
  US_STATES.includes(t) || CA_PROVINCES.includes(t) || AU_STATES.includes(t) || (t.length <= 3 && t in COUNTRY_CODE)
