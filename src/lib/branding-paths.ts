// The plain facts about an artist's photo and logo files (no server code, so the browser can use them too):
// where they live, how big and what kind they may be, and how to tell a real picture from a renamed file.
import { sniffImageType, type ImageKind } from '@/lib/image-sniff'

export const BRANDING_BUCKET = 'artist-branding'
export const MAX_BRANDING_BYTES = 5 * 1024 * 1024
export type BrandingKind = 'photo' | 'logo'
export const BRANDING_COLUMN: Record<BrandingKind, 'photo_path' | 'logo_path'> = { photo: 'photo_path', logo: 'logo_path' }

/** The extensions we accept in a file name, mapped to the kind of picture it must be. */
export const BRANDING_EXT: Record<string, ImageKind> = { png: 'png', jpg: 'jpg', jpeg: 'jpg', webp: 'webp' }
export const BRANDING_TYPE: Record<ImageKind, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

/** Files live under "<clientId>/<kind>-<random>.<ext>", so a caller can only name files in an artist they were just checked against. */
export function isBrandingPathFor(clientId: string, kind: BrandingKind, path: unknown): path is string {
  return typeof path === 'string'
    && path.length <= 200
    && !path.includes('..')
    && new RegExp(`^${clientId.replace(/[.]/g, '\\.')}/${kind}-[A-Za-z0-9]+\\.(png|jpe?g|webp)$`, 'i').test(path)
}

export const extOfPath = (path: string) => (path.split('.').pop() ?? '').toLowerCase()

/** What the first bytes of an uploaded file say it is, if (and only if) that matches the extension in its name. */
export function verifiedImageKind(path: string, bytes: Uint8Array): ImageKind | null {
  const real = sniffImageType(bytes)
  return real && BRANDING_EXT[extOfPath(path)] === real ? real : null
}

/** The longest side a stored picture is shrunk to (a bigger one gains nothing on screen and costs space). */
export const MAX_SIDE: Record<BrandingKind, number> = { photo: 1600, logo: 800 }

/** The size to draw a picture at so its longest side is at most `max` (never made bigger). */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (!(longest > 0)) return { width: 1, height: 1 }
  const scale = Math.min(1, max / longest)
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
