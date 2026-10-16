// Checks the app's "look" setting and that the glass colours keep small text readable.  Run with:  npx tsx scripts/check-look.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DEFAULT_LOOK, DEFAULT_THEME, LOOK_COOKIE, THEME_COOKIE, lookCookie, parseLook, parseTheme, themeCookie } from '../src/lib/look'

// ── the setting ──
assert.equal(DEFAULT_LOOK, 'glass')
assert.equal(parseLook('solid'), 'solid')
assert.equal(parseLook('glass'), 'glass')
for (const odd of [undefined, null, '', 'SOLID', 'dark', 'glass; Path=/', '<script>']) assert.equal(parseLook(odd as string | null | undefined), 'glass', String(odd))
assert.equal(lookCookie('solid'), 'mp-look=solid; Path=/; Max-Age=31536000; SameSite=Lax')
assert.ok(lookCookie('glass').startsWith(`${LOOK_COOKIE}=glass;`))

// ── readability: the glass colours in globals.css, checked as WCAG contrast ──
const css = fs.readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8')
const block = (selector: string) => {
  const i = css.indexOf(selector)
  assert.ok(i >= 0, `${selector} not found in globals.css`)
  return css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i))
}
const prop = (src: string, name: string) => {
  const m = src.match(new RegExp(`${name}:\\s*([^;]+);`))
  assert.ok(m, `${name} not found`)
  return m[1].trim()
}
type RGB = [number, number, number]
const hex = (h: string): RGB => { const s = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)) as RGB }
const rgba = (v: string): { rgb: RGB; a: number } => { const m = v.match(/rgba?\(([^)]+)\)/); assert.ok(m, v); const p = m[1].split(',').map(Number); return { rgb: [p[0], p[1], p[2]], a: p[3] ?? 1 } }
const over = (top: RGB, a: number, under: RGB): RGB => top.map((c, i) => c * a + under[i] * (1 - a)) as RGB
const lum = (c: RGB) => { const [r, g, b] = c.map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const ratio = (a: RGB, b: RGB) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

const root = block(':root {')
const glassMode = block('html[data-look="glass"] {')
const glass = rgba(prop(root, '--glass'))
const glassStrong = rgba(prop(root, '--glass-strong'))
const ember = [...prop(root, '--ember').matchAll(/#[0-9a-fA-F]{6}/g)].map(m => hex(m[0]))   // every colour in the glow, plus its base
assert.ok(ember.length >= 4, 'the ember glow lists its colours')

const text: Record<string, RGB> = {
  'main text': hex('#1a1917'),
  'grey-600 (secondary)': hex('#5c584f'),
  'grey-500 on glass': hex(prop(glassMode, '--color-gray-500')),
  'grey-400 on glass': hex(prop(glassMode, '--color-gray-400')),
  'accent on glass': hex(prop(glassMode, '--color-accent')),
}
// Worst case: the glass panel sitting over the most colourful part of the glow. Small text needs 4.5:1.
for (const [panelName, panel] of [['glass', glass], ['strong glass', glassStrong]] as const) {
  for (const behind of ember) {
    const surface = over(panel.rgb, panel.a, behind)
    for (const [name, colour] of Object.entries(text)) {
      if (name === 'grey-600 (secondary)') continue
      assert.ok(ratio(colour, surface) >= 4.5, `${name} on ${panelName} over #${behind.map(v => v.toString(16).padStart(2, '0')).join('')}: ${ratio(colour, surface).toFixed(2)}:1 is below 4.5:1`)
    }
  }
}
// the accent as a button background with white text
assert.ok(ratio([255, 255, 255], hex(prop(glassMode, '--color-accent'))) >= 4.5, 'white text on the glass accent button')
assert.ok(ratio([255, 255, 255], hex(prop(glassMode, '--color-accent-hover'))) >= 4.5, 'white text on the glass accent hover')
// the safety nets are really there
for (const needle of ['prefers-reduced-transparency', '@supports not', '@media print']) assert.ok(css.includes(needle), `globals.css must handle ${needle}`)

// ── the theme setting ──
assert.equal(DEFAULT_THEME, 'light')                       // nobody's screen changes until they choose
for (const t of ['light', 'dark', 'auto'] as const) assert.equal(parseTheme(t), t)
for (const odd of [undefined, null, '', 'DARK', 'night', 'dark; Path=/', '<script>']) assert.equal(parseTheme(odd as string | null | undefined), 'light', String(odd))
assert.equal(themeCookie('dark'), 'mp-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax')
assert.notEqual(THEME_COOKIE as string, LOOK_COOKIE as string)

// ── the dark theme in globals.css ──
// the text between a selector's opening brace and its matching close (so a block inside @media works)
const balanced = (selector: string): string => {
  const i = css.indexOf(selector)
  assert.ok(i >= 0, `${selector} not found in globals.css`)
  let depth = 0
  for (let j = css.indexOf('{', i); j < css.length; j++) {
    if (css[j] === '{') depth++
    if (css[j] === '}' && --depth === 0) return css.slice(css.indexOf('{', i) + 1, j)
  }
  throw new Error(`${selector} is not closed`)
}
const darkTokens = balanced('html[data-theme="dark"] {')
const autoTokens = balanced('html[data-theme="auto"] {')
assert.equal(darkTokens, autoTokens, 'the "dark" and "auto" token blocks must be identical (auto is dark on a dark device)')
assert.equal(balanced('html[data-theme="dark"][data-look="glass"] {'), balanced('html[data-theme="auto"][data-look="glass"] {'), 'dark-glass overrides must match for dark and auto')
assert.equal(balanced('html[data-theme="dark"] .bg-accent {'), balanced('html[data-theme="auto"] .bg-accent {'))
const between = (start: string, end: string) => css.slice(css.indexOf(start) + start.length, css.indexOf(end))
assert.equal(between('SOLID-BG-DARK-BEGIN */', '/* SOLID-BG-DARK-END').replaceAll('data-theme="dark"', 'X'), between('SOLID-BG-AUTO-BEGIN */', '/* SOLID-BG-AUTO-END').replaceAll('data-theme="auto"', 'X'), 'solid-background fixes must match for dark and auto')
for (const needle of ['.bg-green-600 {', '.hover\\:bg-purple-700:hover {', '.bg-red-600 {']) assert.ok(between('SOLID-BG-DARK-BEGIN */', '/* SOLID-BG-DARK-END').includes(needle), `${needle} keeps its colour at night`)
assert.ok(darkTokens.includes('color-scheme: dark'), 'form controls and scrollbars must follow the dark theme')
assert.ok(css.includes('@media print') && /html\[data-theme\]\s*\{[^}]*--color-canvas: #ffffff/.test(css), 'printing is always on white paper')

// colour maths for oklch / oklab tints
const cbrt = Math.cbrt
const oklchToRgb = (v: string): RGB => {
  const m = v.match(/oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*\)/); assert.ok(m, v)
  const L = Number(m[1]) / 100, C = Number(m[2]), h = Number(m[3]) * Math.PI / 180
  return oklabToRgb([L, C * Math.cos(h), C * Math.sin(h)])
}
const oklabToRgb = ([L, a, b]: RGB): RGB => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return lin.map(c => { const x = Math.min(1, Math.max(0, c)); return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055) }) as RGB
}
const rgbToOklab = (c: RGB): RGB => {
  const [r, g, b] = c.map(v => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
// any colour the dark block states: a hex, an oklch(), or color-mix(in oklab, <oklch> N%, <hex>)
const colour = (v: string): RGB => {
  const mix = v.match(/color-mix\(in oklab,\s*(oklch\([^)]*\))\s+([\d.]+)%,\s*(#[0-9a-fA-F]{6})\)/)
  if (mix) { const a = rgbToOklab(oklchToRgb(mix[1])), b = rgbToOklab(hex(mix[3])), t = Number(mix[2]) / 100; return oklabToRgb([0, 1, 2].map(i => a[i] * t + b[i] * (1 - t)) as RGB) }
  return v.startsWith('oklch') ? oklchToRgb(v) : hex(v)
}
const dark = (name: string) => colour(prop(darkTokens, name))
const darkCanvas = dark('--color-canvas')
const need = (what: string, fg: RGB, bg: RGB, min = 4.5) => assert.ok(ratio(fg, bg) >= min, `dark: ${what} is ${ratio(fg, bg).toFixed(2)}:1, below ${min}:1`)

// greys and accent on the dark page, and on dark glass over the darkest-to-brightest spot of the dark glow
const darkGlass = rgba(prop(darkTokens, '--glass')), darkGlassStrong = rgba(prop(darkTokens, '--glass-strong'))
const darkGlow = [...prop(darkTokens, '--ember').matchAll(/#[0-9a-fA-F]{6}/g)].map(m => hex(m[0]))
const darkSurfaces: [string, RGB][] = [['the dark page', darkCanvas], ...[darkGlass, darkGlassStrong].flatMap(panel => darkGlow.map((g, i) => [`dark glass over glow ${i}`, over(panel.rgb, panel.a, g)] as [string, RGB]))]
for (const [where, surface] of darkSurfaces) {
  for (const t of ['--color-gray-400', '--color-gray-500', '--color-gray-600', '--color-gray-700', '--color-gray-800', '--color-gray-900', '--color-accent']) need(`${t} on ${where}`, dark(t), surface)
}
need('dark text on the accent button', hex('#1a0c06'), dark('--color-accent'))
need('dark text on the accent button when hovered', hex('#1a0c06'), dark('--color-accent-hover'))
need('accent text on the soft accent chip', dark('--color-accent'), dark('--color-accent-soft'))
// the coloured tints: the light text shades (600-900) must read on the dark page and on every tinted background (50, 100)
for (const f of ['red', 'orange', 'amber', 'green', 'teal', 'cyan', 'sky', 'blue', 'purple', 'pink']) {
  for (const text of [600, 700, 800, 900]) {
    need(`${f}-${text} text on the dark page`, dark(`--color-${f}-${text}`), darkCanvas)
    for (const bg of [50, 100]) need(`${f}-${text} text on ${f}-${bg}`, dark(`--color-${f}-${text}`), dark(`--color-${f}-${bg}`))
  }
  need(`${f}-600 text on ${f}-200 (a chip with a border colour behind it)`, dark(`--color-${f}-600`), dark(`--color-${f}-200`))
}
// the artist portal's own colour, lightened for the dark: even the darkest colour the portal allows must read as text
for (const base of ['#000000', '#1a1a1a', '#4c8df6', '#8b5cf6', '#d9461f', '#b83816', '#0d5f2a']) {
  const lightened = hex(base).map(c => c * 0.38 + 255 * 0.62) as RGB   // color-mix(in srgb, <colour> 38%, white)
  need(`artist colour ${base}, lightened, on the dark page`, lightened, darkCanvas)
}

console.log('look: all checks passed')
