// The small pure helpers every email feature shares: is this an address, make text safe to put in an email. No sending code in here, so
// screens (which check what a person typed) can import it without pulling the sender into the browser.

/** A plain ASCII address, the kind a person types: letters, digits and . _ + - before the @, dotted letter/digit/hyphen labels after it. */
export function looksLikeEmail(s: string): boolean {
  if (s.length > 254) return false
  const at = s.indexOf('@')
  if (at < 1 || at !== s.lastIndexOf('@')) return false
  const local = s.slice(0, at), domain = s.slice(at + 1)
  if (local.length > 64 || !/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(local) || local.includes('..') || local.endsWith('.')) return false
  const labels = domain.split('.')
  if (labels.length < 2 || !labels.every(l => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(l))) return false
  return /^[A-Za-z]{2,24}$/.test(labels[labels.length - 1])
}

/** Text that is safe to put inside an HTML email. */
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * Words somebody else typed (a contract's name, an artist's name), cleaned before they go into an email to a stranger: no angle brackets or
 * control characters, links taken out (so the email can never be used to carry someone's link), one line, and cut to a sensible length.
 */
export function plainLine(s: string, max: number): string {
  const clean = s
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\b(?:https?:\/\/|ftp:\/\/|www\.)\S+/gi, '[link removed]')
    .replace(/\s+/g, ' ')
    .trim()
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}
