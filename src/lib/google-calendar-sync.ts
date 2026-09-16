// Server-only glue between Supabase and Google Calendar. Looks up a
// client's connection, keeps its access token fresh, and pushes
// Show/Post/Project changes to the dedicated Google Calendar created for
// that connection (see src/lib/google-calendar.ts for the Google API
// wrapper this calls into). Never import this from a 'use client'
// component — it uses the service-role Supabase client throughout, the
// same way src/lib/plaid.ts's callers do for bank_connections.
import { createAdminClient } from '@/lib/supabase/admin'
import { refreshAccessToken, pushEvent, deleteEvent, type GoogleEventInput } from '@/lib/google-calendar'
import type { Show, Post, Project } from '@/types'

type RecordType = 'show' | 'post' | 'project'
type EventInputWithoutTimeZone = Omit<GoogleEventInput, 'timeZone' | 'mgmtStudioType' | 'mgmtStudioId'>

async function getConnection(clientId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('google_calendar_connections')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  return data as {
    id: string; client_id: string; google_calendar_id: string
    access_token: string; refresh_token: string; token_expiry: string | null; time_zone: string
  } | null
}

// Refreshes the access token if it's expired (or about to, within a
// minute), persisting the new token back so the next call doesn't have to.
async function ensureFreshAccessToken(connection: NonNullable<Awaited<ReturnType<typeof getConnection>>>): Promise<string> {
  const expiresAt = connection.token_expiry ? new Date(connection.token_expiry).getTime() : 0
  if (expiresAt > Date.now() + 60_000) return connection.access_token

  const { accessToken, expiryDate } = await refreshAccessToken(connection.refresh_token)
  const admin = createAdminClient()
  await admin.from('google_calendar_connections').update({
    access_token: accessToken,
    token_expiry: expiryDate ? new Date(expiryDate).toISOString() : null,
  }).eq('id', connection.id)
  return accessToken
}

async function getEventLink(connectionId: string, recordType: RecordType, recordId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('google_calendar_event_links')
    .select('id, google_event_id')
    .eq('connection_id', connectionId)
    .eq('record_type', recordType)
    .eq('record_id', recordId)
    .maybeSingle()
  return data as { id: string; google_event_id: string } | null
}

async function saveEventLink(connectionId: string, clientId: string, recordType: RecordType, recordId: string, googleEventId: string) {
  const admin = createAdminClient()
  await admin.from('google_calendar_event_links').upsert({
    id: `gcal-link-${recordType}-${recordId}`,
    connection_id: connectionId,
    client_id: clientId,
    google_event_id: googleEventId,
    record_type: recordType,
    record_id: recordId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'record_type,record_id' })
}

// `input: null` means the record no longer has a date to represent (e.g. a
// Project's due date was cleared) — the Google event, if any, is removed.
async function pushRecord(clientId: string, recordType: RecordType, recordId: string, input: EventInputWithoutTimeZone | null) {
  const connection = await getConnection(clientId)
  if (!connection) return // no connection for this client — nothing to do

  const link = await getEventLink(connection.id, recordType, recordId)

  if (!input) {
    if (link) {
      const accessToken = await ensureFreshAccessToken(connection)
      await deleteEvent(accessToken, connection.google_calendar_id, link.google_event_id)
      await createAdminClient().from('google_calendar_event_links').delete().eq('id', link.id)
    }
    return
  }

  const accessToken = await ensureFreshAccessToken(connection)
  const fullInput: GoogleEventInput = { ...input, timeZone: connection.time_zone, mgmtStudioType: recordType, mgmtStudioId: recordId }
  const googleEventId = await pushEvent(accessToken, connection.google_calendar_id, fullInput, link?.google_event_id)
  await saveEventLink(connection.id, clientId, recordType, recordId, googleEventId)
}

// "10:00am" → "22:00" style 24h time. Posts store 12h time; Shows already
// store 24h time (src/types/index.ts) — normalized to one format here
// since Google's API only takes one.
function to24h(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})(am|pm)$/i)
  if (!m) return t
  let h = parseInt(m[1], 10)
  if (/pm/i.test(m[3]) && h !== 12) h += 12
  if (/am/i.test(m[3]) && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${m[2]}`
}

export async function pushShowToGoogle(show: Show, clientId: string) {
  await pushRecord(clientId, 'show', show.id, {
    title: `${show.venue} — ${show.city}`,
    date: show.date,
    time: show.time,
    durationMinutes: 180,
  })
}

export async function pushPostToGoogle(post: Post, clientId: string) {
  await pushRecord(clientId, 'post', post.id, {
    title: post.title,
    date: post.date,
    time: to24h(post.time),
    durationMinutes: 30,
  })
}

export async function pushProjectToGoogle(project: Project, clientId: string) {
  if (!project.dueDate) {
    await pushRecord(clientId, 'project', project.id, null)
    return
  }
  await pushRecord(clientId, 'project', project.id, {
    title: project.title,
    date: project.dueDate,
  })
}

export async function deleteShowFromGoogle(showId: string, clientId: string) {
  await pushRecord(clientId, 'show', showId, null)
}
export async function deletePostFromGoogle(postId: string, clientId: string) {
  await pushRecord(clientId, 'post', postId, null)
}
export async function deleteProjectFromGoogle(projectId: string, clientId: string) {
  await pushRecord(clientId, 'project', projectId, null)
}
