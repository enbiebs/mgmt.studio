// The app's "look": frosted glass over a warm ember glow (the default), or the plain paper it had before. One setting per
// person per browser, kept in a cookie so the very first page the server sends already has the right look (no flash).
// Nothing in the cookie is private. Pure helpers, so they can be tested.
export type Look = 'glass' | 'solid'
export const LOOK_COOKIE = 'mp-look'
export const DEFAULT_LOOK: Look = 'glass'

/** Anything unrecognised (no cookie, an old value, tampering) is the default. */
export function parseLook(value: string | null | undefined): Look {
  return value === 'solid' || value === 'glass' ? value : DEFAULT_LOOK
}

/** Switches the page to a look right now and remembers it (browser only; kept out of any component so React's rules are not involved). */
export function applyLook(look: Look): void {
  document.cookie = lookCookie(look)
  document.documentElement.dataset.look = look
}

/** The cookie text that remembers a choice for a year. */
export function lookCookie(look: Look): string {
  return `${LOOK_COOKIE}=${look}; Path=/; Max-Age=31536000; SameSite=Lax`
}
