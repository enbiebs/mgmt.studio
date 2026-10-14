// One-time (and repeatable) loader for the city list used by the distance checks.
//
//   node --env-file=.env.local scripts/load-geonames.mjs /path/to/cities1000.txt
//
// cities1000.txt comes from https://download.geonames.org/export/dump/cities1000.zip (GeoNames,
// CC BY 4.0: https://www.geonames.org). It is tab-separated: id, name, asciiname, alternatenames,
// lat, lon, feature class, feature code, country, cc2, admin1, admin2, admin3, admin4, population, ...
// Re-running is safe: rows are upserted by GeoNames id.
import fs from 'node:fs'
import readline from 'node:readline'
import { createClient } from '@supabase/supabase-js'

const file = process.argv[2]
if (!file || !fs.existsSync(file)) { console.error('Usage: node --env-file=.env.local scripts/load-geonames.mjs <cities1000.txt>'); process.exit(1) }
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// GeoNames numbers the provinces/states of Canada and Australia; people write their letters (ON, VIC).
const CA = { '01': 'AB', '02': 'BC', '03': 'MB', '04': 'NB', '05': 'NL', '07': 'NS', '08': 'ON', '09': 'PE', '10': 'QC', '11': 'SK', '12': 'YT', '13': 'NT', '14': 'NU' }
const AU = { '01': 'ACT', '02': 'NSW', '03': 'NT', '04': 'QLD', '05': 'SA', '06': 'TAS', '07': 'VIC', '08': 'WA' }
const plain = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

const rows = []
for await (const line of readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity })) {
  const c = line.split('\t')
  if (c.length < 15) continue
  const [id, name, ascii, alts, lat, lon, , , country, , admin1, , , , pop] = c
  const alt = [...new Set(alts.split(',').map(plain).filter(a => a && a !== plain(ascii) && /^[a-z0-9 ]+$/.test(a)))].slice(0, 12)
  rows.push({
    geonameid: Number(id), name, ascii_name: plain(ascii || name), alt_names: alt,
    lat: Number(lat), lon: Number(lon), country,
    admin1: country === 'CA' ? (CA[admin1] ?? admin1) : country === 'AU' ? (AU[admin1] ?? admin1) : (admin1 || null),
    population: Number(pop) || 0,
  })
}
console.log(`Read ${rows.length} cities. Loading...`)
let done = 0
for (let i = 0; i < rows.length; i += 1000) {
  const { error } = await supabase.from('geo_cities').upsert(rows.slice(i, i + 1000), { onConflict: 'geonameid' })
  if (error) { console.error('Failed at row', i, error.message); process.exit(1) }
  done += Math.min(1000, rows.length - i)
  if (done % 20000 === 0 || done === rows.length) console.log(`  ${done} / ${rows.length}`)
}

// Nicknames people actually type (the city list only knows official names).
const NICKNAMES = {
  5128581: ['new york', 'nyc', 'ny', 'new york ny'],   // New York City
  5368361: ['la'],                                     // Los Angeles
  5506956: ['vegas'],                                  // Las Vegas
  5391959: ['sf', 'san fran'],                         // San Francisco
  4140963: ['dc', 'washington dc', 'washington d c'],  // Washington, D.C.
  4560349: ['philly'],                                 // Philadelphia
}
for (const [id, extra] of Object.entries(NICKNAMES)) {
  const { data, error } = await supabase.from('geo_cities').select('alt_names').eq('geonameid', Number(id)).single()
  if (error) { console.error('Nickname lookup failed for', id, error.message); continue }
  const merged = [...new Set([...(data.alt_names ?? []), ...extra])]
  const { error: e2 } = await supabase.from('geo_cities').update({ alt_names: merged }).eq('geonameid', Number(id))
  if (e2) console.error('Nickname update failed for', id, e2.message)
}
console.log('Done.')
