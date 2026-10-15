// Checks the artist-color theme for the portal.  Run with:  npx tsx scripts/check-portal-theme.ts
import assert from 'node:assert/strict'
import { contrastWithWhite, luminance, parseHex, portalStyle, portalTheme, toHex } from '../src/lib/portal-theme'

// reading a color: only a plain #rrggbb counts
assert.deepEqual(parseHex('#4c8df6'), [76, 141, 246])
assert.deepEqual(parseHex('#FFFFFF'), [255, 255, 255])
assert.deepEqual(parseHex('  #000000 '), [0, 0, 0])
for (const bad of ['red', '#fff', '#12345', '#1234567', 'rgb(1,2,3)', '', null, undefined, '#gggggg', 'javascript:alert(1)', 'url(x)']) assert.equal(parseHex(bad as string), null, String(bad))
assert.equal(toHex([76, 141, 246]), '#4c8df6')
assert.equal(toHex([-5, 300, 12.4]), '#00ff0c')                                  // out-of-range values are clamped

// brightness and contrast
assert.ok(luminance([255, 255, 255]) > 0.99 && luminance([0, 0, 0]) === 0)
assert.ok(Math.abs(contrastWithWhite([255, 255, 255]) - 1) < 0.01)
assert.ok(contrastWithWhite([0, 0, 0]) > 20)

// a color that already reads well under white text is kept exactly
assert.equal(portalTheme('#1e3a8a')!.accent, '#1e3a8a')
const dark = portalTheme('#1e3a8a')!
assert.ok(contrastWithWhite(parseHex(dark.accent)!) >= 4.5)

// every color, light or dark, ends up readable under white text; light ones are darkened, never brightened
for (const c of ['#ffff00', '#ffffff', '#f5f5f5', '#fde047', '#ec4899', '#4c8df6', '#22c55e', '#000000', '#ff9900', '#a3e635']) {
  const t = portalTheme(c)!
  assert.ok(contrastWithWhite(parseHex(t.accent)!) >= 4.5, `${c} -> ${t.accent} is hard to read under white text`)
  assert.ok(luminance(parseHex(t.accent)!) <= luminance(parseHex(c)!) + 1e-9, `${c} was made lighter`)
  assert.ok(luminance(parseHex(t.hover)!) <= luminance(parseHex(t.accent)!), `${c}: hover is not darker`)
  assert.ok(luminance(parseHex(t.soft)!) > 0.7, `${c}: the soft tint is not light`)
}
assert.notEqual(portalTheme('#ffff00')!.accent, '#ffff00')                      // pure yellow with white text would be unreadable

// the style handed to the page
assert.deepEqual(Object.keys(portalStyle('#4c8df6')!).sort(), ['--color-accent', '--color-accent-hover', '--color-accent-soft'])
assert.equal(portalStyle('not a color'), undefined)                              // anything odd: keep the product's own accent
assert.equal(portalStyle(undefined), undefined)
assert.equal(portalTheme('#4c8df6')!.accent, portalStyle('#4c8df6')!['--color-accent'])
console.log('portal-theme: all checks passed')
