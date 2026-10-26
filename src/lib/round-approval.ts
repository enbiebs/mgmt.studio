// ──────────────────────────────────────────────────────────
//  Approving a version of a track: which versions are waiting for the artist, which came back with "I want changes", and how to say so.
//  Pure logic (no store, no screen), covered by scripts/check-round-approval.ts. The rules about WHO may answer live in the database
//  (migration 072); this file only reads the state.
// ──────────────────────────────────────────────────────────

import type { Client, TrackRound } from '@/types'
import { daysUntil } from '@/lib/date-state'
import { dateWord } from '@/lib/contract-dates'
import { localDateOf } from '@/lib/utils'

/** A version still unanswered after this many days is worth a nudge on Today. */
export const NUDGE_DAYS = 3
/** ...and after this many it is urgent. */
export const URGENT_DAYS = 10

export interface RoundRef { albumId: string; albumTitle: string; trackId: string; trackTitle: string; round: TrackRound }

/** Every version of every track of this artist, with where it sits. */
export function roundsOf(client: Pick<Client, 'songs'>): RoundRef[] {
  return (client.songs?.albums ?? []).flatMap(a => a.tracks.flatMap(t => (t.rounds ?? []).map(round => ({ albumId: a.id, albumTitle: a.title, trackId: t.id, trackTitle: t.title, round }))))
}

/** Is this the newest version of its track? (An older version that was asked about no longer matters once there is a newer one.) */
const isLatest = (client: Pick<Client, 'songs'>, r: RoundRef) => {
  const rounds = (client.songs?.albums ?? []).find(a => a.id === r.albumId)?.tracks.find(t => t.id === r.trackId)?.rounds ?? []
  return rounds[rounds.length - 1]?.id === r.round.id
}

/** Versions waiting for the artist's answer (only each track's newest version), the longest-waiting first. */
export function waitingForAnswer(client: Pick<Client, 'songs'>): RoundRef[] {
  return roundsOf(client).filter(r => r.round.approval?.status === 'awaiting' && isLatest(client, r)).sort((a, b) => (a.round.approval?.askedAt ?? '').localeCompare(b.round.approval?.askedAt ?? ''))
}

/**
 * Versions the artist sent back with "I want changes" that nobody has answered yet: the track has no newer version, and the request has not
 * been sent again. Once a new version is uploaded (or asked about again) it is no longer waiting on management.
 */
export function changesWanted(client: Pick<Client, 'songs'>): RoundRef[] {
  const out: RoundRef[] = []
  for (const a of client.songs?.albums ?? []) for (const t of a.tracks) {
    const rounds = t.rounds ?? []
    const last = rounds[rounds.length - 1]
    if (last?.approval?.status === 'changes') out.push({ albumId: a.id, albumTitle: a.title, trackId: t.id, trackTitle: t.title, round: last })
  }
  return out
}

/** How many days since the request was sent, by the calendar day where the viewer is (0 when it is today, or the time is unknown). */
export const daysWaiting = (round: TrackRound, today: string): number => (round.approval?.askedAt ? Math.max(0, -daysUntil(localDateOf(round.approval.askedAt), today)) : 0)

const day = (iso: string) => dateWord(localDateOf(iso))

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

/** One line saying where a version stands, from the point of view of the team ("Mascolo" is the artist's name). */
export function approvalLine(round: TrackRound, artist: string, today: string): string | null {
  const a = round.approval
  if (!a) return null
  if (a.status === 'awaiting') {
    const d = daysWaiting(round, today)
    return `Waiting for ${artist}'s OK${a.askedAt ? ` since ${day(a.askedAt)}` : ''}${d >= NUDGE_DAYS ? ` (${d} days)` : ''}`
  }
  const who = a.by || artist
  if (a.status === 'approved') return `Approved by ${who}${a.at ? ` on ${day(a.at)}` : ''}${a.note ? `: “${clip(a.note, 120)}”` : ''}`
  return `${who} wants changes${a.at ? ` (${day(a.at)})` : ''}${a.note ? `: “${clip(a.note, 160)}”` : ''}`
}
