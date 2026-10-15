// What an invite (or reset) link carries when Supabase sends someone back to this site.
// Invites come back with the sign-in details after a "#" in the address, which only the browser can see,
// so a server route can't read them. Read here, then handed to the sign-in page that sets them up.
export type AuthHash =
  | { kind: 'session'; accessToken: string; refreshToken: string; type: string | null }
  | { kind: 'error'; message: string }
  | { kind: 'none' }

export function parseAuthHash(hash: string): AuthHash {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')
  if (accessToken && refreshToken) return { kind: 'session', accessToken, refreshToken, type: params.get('type') }
  if (params.get('error') || params.get('error_code') || params.get('error_description')) {
    return { kind: 'error', message: params.get('error_description') ?? 'This link could not be used.' }
  }
  return { kind: 'none' }
}

// True when the address looks like a link that still needs finishing (used to catch people who land on the wrong page).
export function hasAuthHash(hash: string): boolean {
  return parseAuthHash(hash).kind !== 'none'
}
