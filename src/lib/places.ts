'use client'
// Looks up where cities are (the geo_cities table, via the locate_places database function) and
// remembers the answers for the session, so a screen can ask for the same places as often as it
// likes. null = looked up and not found; undefined = not asked yet.

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { placeRequest, type LatLon, type Located } from '@/lib/geo'

const cache = new Map<string, Located | null>()
const pending = new Map<string, Promise<void>>()
const norm = (s: string) => s.trim().toLowerCase()

async function fetchPlaces(cities: string[]): Promise<void> {
  const asks = cities.map(placeRequest)
  const { data, error } = await createClient().rpc('locate_places', { p: asks })
  if (error) throw error
  const answers = (data ?? []) as { key: string; lat?: number; lon?: number; label?: string; how?: Located['how'] }[]
  for (const a of answers) {
    cache.set(norm(a.key), a.lat !== undefined && a.lon !== undefined && a.label && a.how
      ? { lat: a.lat, lon: a.lon, label: a.label, how: a.how } : null)
  }
}

/** Asks for any places not already known. Failures are logged and leave those places "not asked". */
export async function locatePlaces(cities: string[]): Promise<void> {
  const need = [...new Set(cities.map(c => c.trim()).filter(c => c && !cache.has(norm(c))))]
  if (need.length === 0) return
  const key = need.map(norm).sort().join('|')
  let job = pending.get(key)
  if (!job) {
    job = fetchPlaces(need).catch(e => console.error('Could not look up places', e)).finally(() => pending.delete(key))
    pending.set(key, job)
  }
  await job
}

export function useLocated(cities: string[]) {
  const [, setTick] = useState(0)
  // A stable key, so the same list of cities doesn't re-run the lookup on every render.
  const key = JSON.stringify([...new Set(cities.map(c => c.trim()).filter(Boolean))].sort())
  const wanted = useMemo(() => JSON.parse(key) as string[], [key])
  useEffect(() => {
    let alive = true
    locatePlaces(wanted).then(() => { if (alive) setTick(t => t + 1) })
    return () => { alive = false }
  }, [wanted])
  const get = (city: string): Located | null | undefined => cache.get(norm(city))
  const where = (city: string): LatLon | null => get(city) ?? null
  return { get, where, loading: wanted.some(c => !cache.has(norm(c))) }
}
