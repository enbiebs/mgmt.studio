// Tells what kind of picture a file REALLY is from its first bytes, instead of trusting its name or the type
// the browser claimed. Only PNG, JPEG and WEBP are accepted anywhere (never SVG: it can carry script).
export type ImageKind = 'png' | 'jpg' | 'webp'

export function sniffImageType(bytes: Uint8Array): ImageKind | null {
  const at = (i: number) => bytes[i] ?? -1
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)) return 'png'
  // JPEG: FF D8 FF
  if (bytes.length >= 4 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'jpg'
  // WEBP: "RIFF" .... "WEBP"
  if (bytes.length >= 12 && [0x52, 0x49, 0x46, 0x46].every((b, i) => at(i) === b) && [0x57, 0x45, 0x42, 0x50].every((b, i) => at(8 + i) === b)) return 'webp'
  return null
}
