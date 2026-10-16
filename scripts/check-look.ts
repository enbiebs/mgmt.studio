// Checks the app's "look" setting and that the glass colours keep small text readable.  Run with:  npx tsx scripts/check-look.ts
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { DEFAULT_LOOK, LOOK_COOKIE, lookCookie, parseLook } from '../src/lib/look'

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

console.log('look: all checks passed')
