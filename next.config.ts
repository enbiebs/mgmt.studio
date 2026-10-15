import type { NextConfig } from "next";

// ── Security headers ─────────────────────────────────────────
// Sent with every page. The first group is enforced from day one. The content policy starts in
// "report only" mode: the browser tells /api/csp-report what it WOULD have blocked, nothing breaks,
// and we turn it into a real policy once the reports are quiet.
const isProd = process.env.NODE_ENV === 'production'
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : ''
const supabaseSocket = supabaseOrigin.replace(/^https:/, 'wss:')

const contentPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.plaid.com",   // Next.js needs its own inline scripts; Plaid Link loads from its CDN
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseSocket} https://*.plaid.com`,
  "frame-src 'self' https://cdn.plaid.com https://*.plaid.com",
  `media-src 'self' blob: ${supabaseOrigin}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "report-uri /api/csp-report",
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },                     // no other site may put this one in a frame
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  ...(isProd ? [
    { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
    { key: 'Content-Security-Policy-Report-Only', value: contentPolicy },
  ] : []),
]

const nextConfig: NextConfig = {
  // Pin the project root so Next doesn't guess it from stray lockfiles elsewhere.
  turbopack: {
    root: __dirname,
  },
  poweredByHeader: false,   // don't announce which framework (and version) this is
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
};

export default nextConfig;
