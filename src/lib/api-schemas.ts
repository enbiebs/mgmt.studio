// The shape every API route expects, checked on the server before anything else happens.
// (What the browser "sends" is only ever a request: nothing in it is trusted until it passes these.)
import { z } from 'zod'

export const clientIdSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/)
const shortId = z.string().min(1).max(100)
const storagePath = z.string().min(3).max(300)

import { MAX_FIELD_CHARS } from '@/lib/profile-fields'
import { INVITE_SECTION_KEYS, MAX_INVITE_ARTISTS } from '@/lib/invite-access'

// "artist", or the id of a person in the artist's directory
const subjectSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/)
export const secureReadBody = z.object({ clientId: clientIdSchema, subject: subjectSchema, tier: z.literal('private') })
export const secureSaveBody = z.object({
  clientId: clientIdSchema,
  subject: subjectSchema,
  tier: z.literal('private'),
  // field name -> new value; an empty value clears the field
  set: z.record(z.string().max(60), z.string().max(MAX_FIELD_CHARS)).refine(o => Object.keys(o).length <= 40, { message: 'too many fields' }),
})

export const clientOnly = z.object({ clientId: clientIdSchema })
export const clientAndPath = z.object({ clientId: clientIdSchema, path: storagePath })
const brandingKind = z.enum(['photo', 'logo'])
export const brandingUploadBody = z.object({ clientId: clientIdSchema, kind: brandingKind, ext: z.string().max(8) })
export const brandingSaveBody = z.object({ clientId: clientIdSchema, kind: brandingKind, path: storagePath })
export const brandingRemoveBody = z.object({ clientId: clientIdSchema, kind: brandingKind })
export const settlementUploadBody = z.object({ clientId: clientIdSchema, ext: z.string().max(8).optional() })

export const plaidExchangeBody = z.object({
  clientId: clientIdSchema,
  publicToken: z.string().min(10).max(500),
  institutionName: z.string().max(200).nullish(),
})

// Only the roles the invite screen offers (a manager is never created through an invite), and an artist
// invite has to say which artist it is for. A teammate invite can also carry the access to set up for them:
// per artist, a Point Person flag or a view / edit level per page (never the vault, never an unknown page).
const inviteArtistAccess = z.object({
  clientId: clientIdSchema,
  pointPerson: z.boolean().optional(),
  levels: z.record(z.string().max(20), z.enum(['view', 'edit'])).refine(o => Object.keys(o).every(k => INVITE_SECTION_KEYS.includes(k)), { message: 'unknown page' }).optional(),
})
export const inviteBody = z.object({
  /** The company the invitation is for (needed when the sender manages more than one). */
  workspaceId: z.string().uuid().optional(),
  email: z.email().max(254),
  role: z.enum(['team', 'agent', 'lawyer', 'artist']),
  personId: shortId.nullish(),
  clientId: clientIdSchema.nullish(),
  access: z.array(inviteArtistAccess).max(MAX_INVITE_ARTISTS).optional(),
}).refine(b => b.role !== 'artist' || !!b.clientId, { message: 'An artist invite needs an artist' })
  .refine(b => b.role !== 'artist' || !(b.access && b.access.length), { message: 'An artist login does not take page access' })
export const inviteCancelBody = z.object({ memberId: z.string().uuid() })
export const inviteResendBody = z.object({ memberId: z.string().uuid().optional(), inviteId: z.string().uuid().optional() })
  .refine(b => (b.memberId ? 1 : 0) + (b.inviteId ? 1 : 0) === 1, { message: 'Say who to send it to' })

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
