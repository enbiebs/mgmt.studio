// ──────────────────────────────────────────────────────────
//  Links from Mgmt Path to the team's Drive folders. Nothing here talks to Google: a link is just an address
//  someone pasted once, and every screen can then offer an "Open folder" button.
//  Pure logic (no screens, no database), so it is easy to test.
// ──────────────────────────────────────────────────────────
import type { Client, MainSection, Show } from '@/types'

export const DRIVE_FOLDERS = [
  ['root', 'Artist folder'], ['agreements', 'Agreements'], ['music', 'Music'], ['touring', 'Touring'],
  ['content', 'Content'], ['promoterMedia', 'Promoter Media'], ['deals', 'Deals'], ['finance', 'Finance'],
] as const
export type DriveKey = (typeof DRIVE_FOLDERS)[number][0]

/** Which folder each section of the app belongs to (so its header can open it). */
export const SECTION_FOLDER: Partial<Record<MainSection, DriveKey>> = {
  songs: 'music', tour: 'touring', content: 'content', legal: 'agreements', finance: 'finance',
}

/** Only plain web addresses are ever opened: nothing that could run code. */
export const isWebAddress = (v: unknown): v is string => typeof v === 'string' && v.length <= 500 && /^https?:\/\/[^\s]+$/i.test(v.trim())

export const folderLabel = (key: DriveKey) => DRIVE_FOLDERS.find(f => f[0] === key)?.[1] ?? key

/** The saved link for one of the artist's folders, or nothing if it is missing or not a web address. */
export function folderLink(client: Pick<Client, 'profile'> | null | undefined, key: DriveKey): string | undefined {
  const v = client?.profile?.drive?.[key]
  return isWebAddress(v) ? v.trim() : undefined
}

export interface ShowFolder { url: string; kind: 'show' | 'touring' | 'artist' }

/** The best folder to open for a show: its own, else the artist's Touring folder, else the artist's main folder. */
export function showFolder(client: Pick<Client, 'profile'> | null | undefined, show: Pick<Show, 'driveUrl'>): ShowFolder | undefined {
  if (isWebAddress(show.driveUrl)) return { url: show.driveUrl.trim(), kind: 'show' }
  const touring = folderLink(client, 'touring')
  if (touring) return { url: touring, kind: 'touring' }
  const root = folderLink(client, 'root')
  return root ? { url: root, kind: 'artist' } : undefined
}
