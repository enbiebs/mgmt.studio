// The shape every API route expects, checked on the server before anything else happens.
// (What the browser "sends" is only ever a request: nothing in it is trusted until it passes these.)
import { z } from 'zod'

export const clientIdSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/)
const shortId = z.string().min(1).max(100)
const storagePath = z.string().min(3).max(300)

export const clientOnly = z.object({ clientId: clientIdSchema })
export const clientAndPath = z.object({ clientId: clientIdSchema, path: storagePath })
export const settlementUploadBody = z.object({ clientId: clientIdSchema, ext: z.string().max(8).optional() })

export const plaidExchangeBody = z.object({
  clientId: clientIdSchema,
  publicToken: z.string().min(10).max(500),
  institutionName: z.string().max(200).nullish(),
})

// Only the roles the invite screen offers (a manager is never created through an invite), and an artist
// invite has to say which artist it is for.
export const inviteBody = z.object({
  email: z.email().max(254),
  role: z.enum(['team', 'agent', 'lawyer', 'artist']),
  personId: shortId.nullish(),
  clientId: clientIdSchema.nullish(),
}).refine(b => b.role !== 'artist' || !!b.clientId, { message: 'An artist invite needs an artist' })

export const gcalConnectBody = z.object({ clientId: clientIdSchema, timeZone: z.string().max(64).regex(/^[A-Za-z0-9_+\-/]+$/).optional() })
const recordType = z.enum(['show', 'post', 'project'])
export const gcalPushBody = z.object({
  clientId: clientIdSchema,
  recordType,
  record: z.object({ id: shortId }).passthrough(),
})
export const gcalPushDeleteBody = z.object({ clientId: clientIdSchema, recordType, recordId: shortId })

/** The section a Google Calendar push belongs to, so only someone who could have saved the record can push it. */
export const SECTION_FOR_RECORD = { show: 'tour', post: 'content', project: 'projects' } as const

/** Calendar feed tokens are random UUIDs. */
export const calendarTokenSchema = z.string().regex(/^[0-9a-fA-F-]{36}$/)
