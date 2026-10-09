import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { FX_CURRENCIES, fetchRate } from '@/lib/fx'

// Rates are refreshed at most every 6 hours, and only when someone asks for them.
const MAX_AGE_MS = 6 * 60 * 60 * 1000

// Returns { rates, fetchedAt, stale }: USD per one unit of each currency. Serves
// the cached rows, refreshing any that are missing or old (Yahoo first, ECB as the
// automatic backup). If a refresh fails the last known rate is served and `stale`
// is true, so a budget never loses its numbers because a rate feed is down.
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const admin = createAdminClient()
  const { data: rows } = await admin.from('fx_rates').select('currency, rate_to_usd, source, fetched_at')
  const cached = new Map((rows ?? []).map(r => [r.currency as string, r]))

  let stale = false
  for (const cur of FX_CURRENCIES) {
    const row = cached.get(cur)
    if (row && Date.now() - new Date(row.fetched_at).getTime() < MAX_AGE_MS) continue
    try {
      const { rate, source } = await fetchRate(cur)
      const fetched_at = new Date().toISOString()
      await admin.from('fx_rates').upsert({ currency: cur, rate_to_usd: rate, source, fetched_at })
      cached.set(cur, { currency: cur, rate_to_usd: rate, source, fetched_at })
    } catch (e) {
      console.error(`Could not refresh ${cur} rate`, e)
      stale = true
    }
  }

  const rates: Record<string, number> = { USD: 1 }
  let fetchedAt: string | null = null
  for (const [cur, row] of cached) {
    rates[cur] = Number(row.rate_to_usd)
    if (!fetchedAt || row.fetched_at < fetchedAt) fetchedAt = row.fetched_at
  }
  return NextResponse.json({ rates, fetchedAt, stale })
}
