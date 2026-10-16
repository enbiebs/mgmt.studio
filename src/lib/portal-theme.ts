// The artist's own portal wears the artist's color: its buttons, highlights and focus rings take their accent
// instead of the product's. Pure logic (no screen), so it can be tested.
//
// A button's text is white, so a color that is too light is darkened until white text on it is easy to read
// (the same contrast rule web accessibility uses for normal text, 4.5 : 1). A value that isn't a plain #rrggbb
// color is ignored and the portal keeps the product's own accent.

export type Rgb = [number, number, number]

export function parseHex(color: string | undefined | null): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec((color ?? '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const toHex = ([r, g, b]: Rgb) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

/** How bright a color is to the eye: 0 (black) to 1 (white). */
export function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4) }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** The contrast between white text and this color (1 = none, 21 = black on white). */
export const contrastWithWhite = (rgb: Rgb) => 1.05 / (luminance(rgb) + 0.05)

const mix = (a: Rgb, b: Rgb, amountOfB: number): Rgb => [0, 1, 2].map(i => a[i] + (b[i] - a[i]) * amountOfB) as Rgb

export interface PortalTheme { accent: string; hover: string; soft: string }

/** The three colors the portal uses, or null to keep the product's own accent. */
export function portalTheme(color: string | undefined | null): PortalTheme | null {
  let rgb = parseHex(color)
  if (!rgb) return null
  for (let i = 0; i < 30 && contrastWithWhite(rgb) < 4.5; i++) rgb = mix(rgb, [0, 0, 0], 0.08)   // too light for white text: darken a little at a time
  return { accent: toHex(rgb), hover: toHex(mix(rgb, [0, 0, 0], 0.14)), soft: toHex(mix(rgb, [255, 255, 255], 0.86)) }
}

/** The inline style that re-points the product's accent tokens at the artist's color. */
export function portalStyle(color: string | undefined | null): Record<string, string> | undefined {
  const t = portalTheme(color)
  // --portal-accent is the artist's colour itself: the dark theme lightens it from there (see globals.css, [data-portal])
  return t ? { '--color-accent': t.accent, '--color-accent-hover': t.hover, '--color-accent-soft': t.soft, '--portal-accent': t.accent } : undefined
}
