import { NextRequest, NextResponse } from 'next/server'
import { addressKey, rateLimit } from '@/lib/api-guard'

// Browsers post here when something on a page breaks the site's content policy (see next.config.ts).
// The policy starts in "report only" mode: nothing is blocked, we just learn what would be, and fix
// it before turning the policy on for real. Reports come with no sign-in, so this is small, capped,
// and rate limited by the sender's address; it only writes a short line to the server log.
export async function POST(req: NextRequest) {
  const limited = await rateLimit(addressKey(req), 'public')
  if (limited) return new NextResponse(null, { status: 204 })

  const text = (await req.text().catch(() => '')).slice(0, 8_000)
  try {
    const raw = JSON.parse(text)
    const r = raw['csp-report'] ?? raw
    console.warn('CSP report:', JSON.stringify({
      directive: r['violated-directive'] ?? r['effective-directive'],
      blocked: String(r['blocked-uri'] ?? '').slice(0, 200),
      page: String(r['document-uri'] ?? '').slice(0, 200),
    }))
  } catch { /* not JSON: ignore */ }
  return new NextResponse(null, { status: 204 })
}
