// Server-only Google Calendar OAuth + API wrapper. Never import this from a
// 'use client' component — it handles the OAuth client secret and access
// tokens, which must never reach the browser. Pure Google API concerns only;
// see src/lib/google-calendar-sync.ts for the Supabase-facing glue.
import { google } from 'googleapis'
import type { calendar_v3 } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/calendar']

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!,
  )
}

// `state` carries `${userId}:${clientId}` — same pattern as Plaid's
// client_user_id (src/lib/plaid.ts's caller) — so the callback route knows
// which Mgmt Studio client this connection belongs to.
export function getAuthUrl(state: string): string {
  const oauth2Client = getOAuthClient()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',   // required to receive a refresh_token
    prompt: 'consent',        // force refresh_token even on repeat consent
    scope: SCOPES,
    state,
  })
}

export async function exchangeCodeForTokens(code: string) {
  const oauth2Client = getOAuthClient()
  const { tokens } = await oauth2Client.getToken(code)
  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Google did not return a refresh token — the user may need to revoke prior access and reconnect')
  }
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiryDate: tokens.expiry_date ?? null,
  }
}

function clientFor(accessToken: string): calendar_v3.Calendar {
  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({ access_token: accessToken })
  return google.calendar({ version: 'v3', auth: oauth2Client })
}

// Creates the dedicated secondary calendar a connection syncs against —
// deliberately never the user's primary calendar (see the plan's privacy
// note: two-way syncing someone's whole personal calendar would be both
// wrong and a real overreach).
export async function createDedicatedCalendar(accessToken: string, clientName: string): Promise<string> {
  const calendar = clientFor(accessToken)
  const res = await calendar.calendars.insert({
    requestBody: { summary: `Mgmt Studio — ${clientName}` },
  })
  if (!res.data.id) throw new Error('Google did not return a calendar id')
  return res.data.id
}

export async function refreshAccessToken(refreshToken: string) {
  const oauth2Client = getOAuthClient()
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  const { credentials } = await oauth2Client.refreshAccessToken()
  if (!credentials.access_token) throw new Error('Google did not return a refreshed access token')
  return {
    accessToken: credentials.access_token,
    expiryDate: credentials.expiry_date ?? null,
  }
}

export type GoogleEventInput = {
  title: string
  timeZone: string
  // Either a timed event (date + 24h "HH:MM" start time, plus a duration
  // in minutes) or an all-day event (date only, no time).
  date: string
  time?: string
  durationMinutes?: number
  mgmtStudioType: 'show' | 'post' | 'project'
  mgmtStudioId: string
}

function toEventBody(input: GoogleEventInput): calendar_v3.Schema$Event {
  const base: calendar_v3.Schema$Event = {
    summary: input.title,
    extendedProperties: {
      private: { mgmtStudioType: input.mgmtStudioType, mgmtStudioId: input.mgmtStudioId },
    },
  }
  if (!input.time) {
    // All-day event (e.g. a Project's due date has no time component).
    return { ...base, start: { date: input.date }, end: { date: input.date } }
  }
  const start = new Date(`${input.date}T${input.time}:00`)
  const end = new Date(start.getTime() + (input.durationMinutes ?? 60) * 60_000)
  return {
    ...base,
    start: { dateTime: start.toISOString(), timeZone: input.timeZone },
    end: { dateTime: end.toISOString(), timeZone: input.timeZone },
  }
}

// Creates a new event, or updates it in place if `existingEventId` is given.
export async function pushEvent(accessToken: string, calendarId: string, input: GoogleEventInput, existingEventId?: string): Promise<string> {
  const calendar = clientFor(accessToken)
  const body = toEventBody(input)
  if (existingEventId) {
    const res = await calendar.events.update({ calendarId, eventId: existingEventId, requestBody: body })
    if (!res.data.id) throw new Error('Google did not return an event id')
    return res.data.id
  }
  const res = await calendar.events.insert({ calendarId, requestBody: body })
  if (!res.data.id) throw new Error('Google did not return an event id')
  return res.data.id
}

export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const calendar = clientFor(accessToken)
  try {
    await calendar.events.delete({ calendarId, eventId })
  } catch (e) {
    // Already gone on the Google side (e.g. deleted there first) — treat as success.
    const status = (e as { code?: number; response?: { status?: number } })?.response?.status ?? (e as { code?: number })?.code
    if (status !== 404 && status !== 410) throw e
  }
}
