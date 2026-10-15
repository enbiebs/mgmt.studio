// Where to send someone after signing in. The address comes from a link, so it can't be trusted:
// "@evil.com" or ".evil.com" glued onto our own address would otherwise land them on another site.
// Only plain paths on this site are allowed; anything else becomes the home page.
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /[\u0000-\u001f]/.test(raw)) return '/'
  return raw
}
