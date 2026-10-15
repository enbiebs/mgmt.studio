// Checks the picture rules for an artist's photo and logo.  Run with:  npx tsx scripts/check-branding.ts
import assert from 'node:assert/strict'
import { sniffImageType } from '../src/lib/image-sniff'
import { BRANDING_EXT, MAX_BRANDING_BYTES, MAX_SIDE, extOfPath, fitWithin, isBrandingPathFor, verifiedImageKind } from '../src/lib/branding-paths'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46])
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50])
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
const html = new TextEncoder().encode('<html><script>alert(1)</script></html>')
const gif = new TextEncoder().encode('GIF89a......')

// the real kind comes from the first bytes, never from the name
assert.equal(sniffImageType(png), 'png')
assert.equal(sniffImageType(jpg), 'jpg')
assert.equal(sniffImageType(webp), 'webp')
for (const bad of [svg, html, gif, new Uint8Array([]), new Uint8Array([0xff, 0xd8]), new Uint8Array([0x89, 0x50, 0x4e, 0x47]), new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x41, 0x56, 0x49, 0x20])]) {
  assert.equal(sniffImageType(bad), null)
}

// the file's name must agree with what it is (a renamed file is refused)
assert.equal(verifiedImageKind('c1/photo-abc.png', png), 'png')
assert.equal(verifiedImageKind('c1/photo-abc.jpg', jpg), 'jpg')
assert.equal(verifiedImageKind('c1/photo-abc.jpeg', jpg), 'jpg')       // .jpeg is the same as .jpg
assert.equal(verifiedImageKind('c1/photo-abc.webp', webp), 'webp')
assert.equal(verifiedImageKind('c1/photo-abc.png', jpg), null)         // a JPEG named .png
assert.equal(verifiedImageKind('c1/photo-abc.png', svg), null)         // script in a picture's clothes
assert.equal(verifiedImageKind('c1/photo-abc.svg', svg), null)
assert.equal(extOfPath('c1/photo-abc.JPG'), 'jpg')

// what extensions are accepted at all (never svg or gif)
assert.deepEqual(Object.keys(BRANDING_EXT).sort(), ['jpeg', 'jpg', 'png', 'webp'])
assert.equal(MAX_BRANDING_BYTES, 5 * 1024 * 1024)

// the path must be in this artist's own folder, for the right kind, with the expected shape
assert.ok(isBrandingPathFor('nimino-7tohmry', 'photo', 'nimino-7tohmry/photo-a1b2c3.jpg'))
assert.ok(isBrandingPathFor('nimino-7tohmry', 'logo', 'nimino-7tohmry/logo-a1b2c3.png'))
assert.ok(isBrandingPathFor('a.b', 'logo', 'a.b/logo-x1.webp'))
assert.ok(!isBrandingPathFor('nimino-7tohmry', 'photo', 'wes-mills-f0kz7ze/photo-a1b2c3.jpg'))      // another artist's folder
assert.ok(!isBrandingPathFor('nimino-7tohmry', 'logo', 'nimino-7tohmry/photo-a1b2c3.jpg'))          // the other kind
assert.ok(!isBrandingPathFor('nimino-7tohmry', 'photo', 'nimino-7tohmry/photo-a1b2c3.svg'))
assert.ok(!isBrandingPathFor('nimino-7tohmry', 'photo', 'nimino-7tohmry/../wes/photo-a1b2c3.jpg'))
assert.ok(!isBrandingPathFor('nimino-7tohmry', 'photo', 'nimino-7tohmry/photo-a1b2c3.jpg/extra'))
assert.ok(!isBrandingPathFor('nimino-7tohmry', 'photo', 'nimino-7tohmry/sub/photo-a1b2c3.jpg'))
assert.ok(!isBrandingPathFor('nimino-7tohmry', 'photo', 'nimino-7tohmry/photo-.jpg'))
assert.ok(!isBrandingPathFor('nimino-7tohmry', 'photo', 'x'.repeat(300)))
assert.ok(!isBrandingPathFor('nimino-7tohmry', 'photo', null))
assert.ok(!isBrandingPathFor('nimino-7tohmry', 'photo', 42))
assert.ok(!isBrandingPathFor('a.b', 'logo', 'aXb/logo-x1.webp'))                                    // a dot in an id is a dot, not "any character"
// shrinking: the longest side is capped, the shape is kept, nothing is ever made bigger
assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 })
assert.deepEqual(fitWithin(3000, 4000, 1600), { width: 1200, height: 1600 })
assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 })          // already small: unchanged
assert.deepEqual(fitWithin(1600, 1600, 1600), { width: 1600, height: 1600 })
assert.deepEqual(fitWithin(10000, 1, 1600), { width: 1600, height: 1 })           // never shrinks a side to nothing
assert.deepEqual(fitWithin(0, 0, 1600), { width: 1, height: 1 })
assert.ok(MAX_SIDE.photo > MAX_SIDE.logo)
console.log('branding: all checks passed')
