// Server-only exchange rates. Yahoo Finance first (what Eli asked for), the
// European Central Bank via Frankfurter as an automatic fallback - Yahoo has no
// official feed, so it can break or block requests without warning.
// Rates are "USD per one unit of the currency", cached in fx_rates.

export const FX_CURRENCIES = ['EUR', 'GBP'] as const   // everything else is USD
export type FxSource = 'yahoo' | 'ecb'

async function fromYahoo(cur: string): Promise<number> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${cur}USD=X?range=1d&interval=1d`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MgmtStudio/1.0)' },
    signal: AbortSignal.timeout(6000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Yahoo ${res.status}`)
  const body = await res.json() as { chart?: { result?: { meta?: { regularMarketPrice?: number } }[] } }
  const price = body.chart?.result?.[0]?.meta?.regularMarketPrice
  if (!price || !(price > 0)) throw new Error('Yahoo returned no price')
  return price
}

async function fromEcb(cur: string): Promise<number> {
  const res = await fetch(`https://api.frankfurter.app/latest?from=${cur}&to=USD`, { signal: AbortSignal.timeout(6000), cache: 'no-store' })
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`)
  const body = await res.json() as { rates?: { USD?: number } }
  const rate = body.rates?.USD
  if (!rate || !(rate > 0)) throw new Error('Frankfurter returned no rate')
  return rate
}

// Yahoo first; if it fails for any reason, the ECB rate; if both fail, throws.
export async function fetchRate(cur: string): Promise<{ rate: number; source: FxSource }> {
  try {
    return { rate: await fromYahoo(cur), source: 'yahoo' }
  } catch (yahooError) {
    console.warn(`Yahoo rate for ${cur} failed, falling back to ECB:`, yahooError)
    return { rate: await fromEcb(cur), source: 'ecb' }
  }
}
