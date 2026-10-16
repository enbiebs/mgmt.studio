// Browser side of "Search the web": asks our own server (which holds the key) for an estimate. The amounts come back in
// US dollars; the caller converts them to the budget's currency.
import type { WebEstimate, WebEstimateRequest } from '@/lib/travel-estimates'

export async function requestWebEstimate(clientId: string, req: WebEstimateRequest): Promise<WebEstimate> {
  const res = await fetch('/api/budgets/estimate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId, ...req }) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json.estimate) throw new Error(typeof json.error === 'string' ? json.error : "Couldn't get an estimate from the web right now.")
  return json.estimate as WebEstimate
}
