// The number of things that need action, shown in the browser tab's title — "(3) Today · Mgmt Path" — so it shows even when the tab is
// behind others. Pure apart from the two remembered values (the page's own title and the number), so the address-bar glue (url-sync)
// and the screen can share them.

let base = ''
let count = 0

/** The title with the number in front; nothing in front when there is nothing to do. */
export const withCount = (title: string, n: number) => (n > 0 ? `(${n > 99 ? '99+' : n}) ${title}` : title)

/** The title without a number in front of it. */
export const stripCount = (title: string) => title.replace(/^\(\d+\+?\) /, '')

/** The title the tab should show right now, or null before the page has said what it is called. */
export const wantedTitle = () => (base ? withCount(base, count) : null)

/** The page's own title ("Today · Mascolo · Mgmt Path"), shown with the number in front. */
export function setBaseTitle(doc: { title: string }, title: string) {
  base = title.replace(/\s+/g, ' ').trim()          // a browser reads the title back with runs of spaces squeezed to one: keep it that way so the two can be compared
  doc.title = withCount(base, count)
}

/** Remembers the number and shows it in the tab right away. */
export function setTabCount(doc: { title: string }, n: number) {
  count = Math.max(0, Math.floor(n) || 0)
  doc.title = withCount(base || stripCount(doc.title), count)
}

/** Used by tests: forget everything. */
export function resetTabTitle() { base = ''; count = 0 }
