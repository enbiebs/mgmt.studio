// Where to send someone after signing in. The address comes from a link, so it can't be trusted:
// "@evil.com" or ".evil.com" glued onto our own address would otherwise land them on another site.
// Only plain paths on this site are allowed; anything else becomes the home page.
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /[\u0000-\u001f]/.test(raw)) return '/'
  return raw
}

/** The sign-in address for someone who is not signed in, remembering the page they were headed to (Home is not worth remembering). */
export function loginPathFor(pathname: string, search = ''): { pathname: '/login'; search: string } {
  const wanted = safeNextPath(pathname + search)
  return { pathname: '/login', search: wanted === '/' ? '' : `?next=${encodeURIComponent(wanted)}` }
}
