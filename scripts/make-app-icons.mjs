// Makes the app's home-screen icons (public/icons/*.png) from the product mark: an accent tile with one white wave.
// One-off: run it again only if the mark or the accent color changes.   node scripts/make-app-icons.mjs
// Needs the "sharp" image package (it comes along with Next.js; it is not one of this app's own dependencies).
import sharp from 'sharp'
import { mkdirSync } from 'node:fs'

const ACCENT = '#d9461f'
const WAVE = 'M5 19c4 0 3-14 7-14s3 14 7 14'   // the same path as the "mark" icon in src/components/ui/Icon.tsx (24 x 24)

// `inset` is the margin around the wave as a share of the tile; a maskable icon needs a wide one, because phones crop its corners into a circle or squircle.
function svg(size, { rounded, inset }) {
  const wave = size * (1 - inset * 2)
  const scale = wave / 24
  const off = size * inset
  const r = rounded ? size * 0.22 : 0
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${r}" fill="${ACCENT}"/>
    <g transform="translate(${off} ${off}) scale(${scale})"><path d="${WAVE}" fill="none" stroke="#ffffff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></g>
  </svg>`
}

mkdirSync('public/icons', { recursive: true })
const out = [
  ['icon-192.png',            192, { rounded: true,  inset: 0.2 }],
  ['icon-512.png',            512, { rounded: true,  inset: 0.2 }],
  ['icon-maskable-512.png',   512, { rounded: false, inset: 0.3 }],   // full-bleed: the phone does the rounding
  ['apple-touch-icon.png',    180, { rounded: false, inset: 0.22 }],  // iPhones round it themselves
]
for (const [name, size, opts] of out) {
  await sharp(Buffer.from(svg(size, opts))).png().toFile(`public/icons/${name}`)
  console.log('wrote public/icons/' + name)
}
