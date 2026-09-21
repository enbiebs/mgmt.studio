// Server-only pull engine: Google Calendar → Mgmt Studio, the reverse of
// google-calendar-sync.ts's push. Runs headless (Vercel Cron, see
// src/app/api/google-calendar/sync/route.ts and vercel.json) — there's no
// browser session, so every write here goes through the admin client
// directly rather than store.ts.
//
// Scope, as agreed: only Shows/Posts/Projects that Mgmt Studio itself
// created (i.e. have a google_calendar_event_links row) are ever touched.
// An event created directly in Google, with no Mgmt Studio origin, is left
// alone permanently — there's no reliable signal for which of the three
// record types it should become. When both sides edited a linked record,
// whichever side's timestamp is newer wins (event.updated from Google vs.
// the record's own updated_at). Deleting a linked event in Google deletes
// the matching Show/Post/Project here too (Eli's explicit choice — the
// safer "unlink only" alternative was considered and rejected).
import { createAdminClient } from '@/lib/supabase/admin'
import { listEvents, SyncTokenInvalidError } from '@/lib/google-calendar'
import { ensureFreshAccessToken, to12h } from '@/lib/google-calendar-sync'
import type { calendar_v3 } from 'googleapis'

type AdminClient = ReturnType<typeof createAdminClient>
type RecordType = 'show' | 'post' | 'project'

type Connection = {
  id: string
  client_id: string
  google_calendar_id: string
  access_token: string
  refresh_token: string
  token_expiry: string | null
  time_zone: string
  sync_token: string | null
}

function tableFor(recordType: RecordType) {
  return recordType === 'show' ? 'shows' : recordType === 'post' ? 'posts' : 'projects'
}

// Converts a Google event's start into the connection's canonical time
// zone — Google may echo back a dateTime in any offset, so this always
// re-derives the wall-clock date/time from the absolute instant rather
// than trusting the string's own offset.
function extractDateTime(event: calendar_v3.Schema$Event, timeZone: string): { date: string; time?: string } {
  if (event.start?.date) return { date: event.start.date } // all-day (Projects)
  if (!event.start?.dateTime) return { date: '' }
  const instant = new Date(event.start.dateTime)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(instant).map(p => [p.type, p.value])
  )
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` }
}

async function deleteLinkedRecord(admin: AdminClient, recordType: RecordType, recordId: string) {
  await admin.from(tableFor(recordType)).delete().eq('id', recordId)
}

// Deliberately conservative for Shows: only date/time are pulled back, never
// venue/city. Those are stored as separate fields but pushed to Google as a
// single "Venue — City" title, and splitting that back apart on an
// arbitrary Google-side edit would be lossy and easy to corrupt. Posts and
// Projects have a single plain title field, so those pull back in full.
async function applyGoogleChangeToRecord(admin: AdminClient, recordType: RecordType, recordId: string, event: calendar_v3.Schema$Event, timeZone: string) {
  const { date, time } = extractDateTime(event, timeZone)
  if (!date) return
  const updated_at = new Date().toISOString()

  if (recordType === 'show') {
    const patch: Record<string, unknown> = { date, updated_at }
    if (time) patch.time = time
    await admin.from('shows').update(patch).eq('id', recordId)
  } else if (recordType === 'post') {
    const patch: Record<string, unknown> = { date, updated_at }
    if (time) patch.time = to12h(time)
    if (event.summary) patch.title = event.summary
    await admin.from('posts').update(patch).eq('id', recordId)
  } else {
    const patch: Record<string, unknown> = { due_date: date, updated_at }
    if (event.summary) patch.title = event.summary
    await admin.from('projects').update(patch).eq('id', recordId)
  }
}

// Pulls every change on one connection's dedicated Google Calendar since
// its last sync (or does a full listing on the very first sync, or after
// Google invalidates the stored sync token).
export async function syncConnection(connection: Connection): Promise<{ pulled: number; deleted: number }> {
  const admin = createAdminClient()
  const accessToken = await ensureFreshAccessToken(connection)

  let syncToken = connection.sync_token ?? undefined
  let nextSyncToken: string | undefined
  let events: calendar_v3.Schema$Event[] = []

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      events = []
      let pageToken: string | undefined
      while (true) {
        const page = await listEvents(accessToken, connection.google_calendar_id, pageToken ? undefined : syncToken, pageToken)
        events.push(...page.events)
        if (page.nextSyncToken) nextSyncToken = page.nextSyncToken
        if (!page.nextPageToken) break
        pageToken = page.nextPageToken
      }
      break
    } catch (e) {
      if (e instanceof SyncTokenInvalidError && attempt === 0) {
        syncToken = undefined // stored token is stale — retry once as a full resync
        continue
      }
      throw e
    }
  }

  let pulled = 0
  let deleted = 0

  for (const event of events) {
    if (!event.id) continue
    const { data: link } = await admin
      .from('google_calendar_event_links')
      .select('id, record_type, record_id')
      .eq('connection_id', connection.id)
      .eq('google_event_id', event.id)
      .maybeSingle()
    if (!link) continue // no Mgmt Studio origin — never auto-imported

    const recordType = link.record_type as RecordType

    if (event.status === 'cancelled') {
      await deleteLinkedRecord(admin, recordType, link.record_id)
      await admin.from('google_calendar_event_links').delete().eq('id', link.id)
      deleted++
      continue
    }

    if (!event.updated) continue
    const googleUpdatedAt = new Date(event.updated)
    const { data: record } = await admin.from(tableFor(recordType)).select('updated_at').eq('id', link.record_id).maybeSingle()
    if (!record) continue // deleted in Mgmt Studio separately; its own delete already cleaned up the link

    if (new Date(record.updated_at) >= googleUpdatedAt) continue // our side is at least as fresh — don't overwrite with a stale echo

    await applyGoogleChangeToRecord(admin, recordType, link.record_id, event, connection.time_zone)
    pulled++
  }

  await admin.from('google_calendar_connections').update({
    sync_token: nextSyncToken ?? null,
    last_synced_at: new Date().toISOString(),
  }).eq('id', connection.id)

  return { pulled, deleted }
}

// Entry point for the cron route: syncs every connected client's calendar,
// isolating failures per-connection so one broken/revoked connection
// doesn't stop the rest from syncing.
export async function syncAllConnections(): Promise<{ connectionsSynced: number; pulled: number; deleted: number; errors: string[] }> {
  const admin = createAdminClient()
  const { data: connections, error } = await admin.from('google_calendar_connections').select('*')
  if (error) throw new Error(error.message)

  let connectionsSynced = 0
  let pulled = 0
  let deleted = 0
  const errors: string[] = []

  for (const connection of (connections ?? []) as Connection[]) {
    try {
      const result = await syncConnection(connection)
      connectionsSynced++
      pulled += result.pulled
      deleted += result.deleted
    } catch (e) {
      errors.push(`client ${connection.client_id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { connectionsSynced, pulled, deleted, errors }
}
