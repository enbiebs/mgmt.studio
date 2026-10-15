'use client'
// ──────────────────────────────────────────────────────────
//  Studio · Global State (Zustand)
//
//  This is the single source of truth for the entire app.
//  Every component reads from here and writes through the
//  actions defined below.
//
//  When you add Supabase:
//   • Replace loadData() with a Supabase query
//   • Replace saveData() calls with supabase.from(...).upsert()
//   • The rest of the app stays the same
// ──────────────────────────────────────────────────────────

import { create } from 'zustand'
import type {
  AppData, Client, Track, Show, ShowStatus, Post, Album,
  MainSection, SongsSub, ContentSub, BizSub, TourSub, Stage, AnalyticsSub, LegalSub,
  UserRole, ProjectStatus, ProjectType, Project, ArtistTodo,
  TrackLabelCopy, ReleaseLabelCopy, ChecklistItemKey, ChecklistItem, TrackPriority,
  GuestListEntry, GuestListCategory, ReleaseStakeholder, StakeholderRole,
  ArtistAccount, ArtistProfile, CrewMember, ShowAdvance, TravelItem, Person, PersonActivity, Currency,
  CatalogWork, RegStatus, Invoice, InvoiceLineItem, InvoiceStatus, RevenueStream,
  LegalTemplate, LegalTemplateClause, TrackRound, TrackNote, TrackNoteReply, TrackCredit,
  ReleaseType, Venue, TourOffer, Expense, Vendor, Run, Budget, BudgetBucket, CrewRate, FinanceSettings,
  OfferSheet, OfferSheetDetail, OfferTerms, Settlement, SettlementDraft, SettlementPayment,
  Task, TaskLinkType, TaskSource, WorkspacePerson, AgendaPoint, AgendaItemType,
} from '@/types'
import { DEMO_DATA } from '@/lib/demo-data'
import { DEFAULT_LEGAL_TEMPLATES } from '@/lib/legal-templates-demo'
import { EMPTY_ANALYTICS } from '@/lib/analytics-demo'
import { EMPTY_AGENT } from '@/lib/agent-demo'
import { EMPTY_LEGAL } from '@/lib/legal-demo'
import { EMPTY_FINANCE } from '@/lib/finance-demo'
import { EMPTY_TOUR } from '@/lib/advance-demo'
import { notify } from '@/lib/notify'
import { nextPosition, pointsFor, MAX_AGENDA_POINTS } from '@/lib/agenda'
import { uid, defaultChecklist, addDays, ROLLOUT_TEMPLATE, today as localToday } from '@/lib/utils'
import { buildNewBudget, snapshotOf, newLine, frozenRates, makeConverter, settlementEarned, BUCKET_LABEL, type FxRates } from '@/lib/budget'
import { balanceOf } from '@/lib/settlement-math'
import type { InboxChoice } from '@/lib/inbox'
import { SHOW_UNFINISHED_KEY } from '@/lib/unfinished'
import { buildOfferSheetSnapshot } from '@/lib/offer-sheet'
import {
  SECTION_TO_GRANT_KEY, findException, filterClientForViewer,
  type ItemException, type ItemType, type ItemEffect, type Viewer,
} from '@/lib/item-access'
import {
  loadWorkspaceData, getMyMembership, getGrantsForMember, getPreviewableMembers,
  loadItemAccess, upsertItemAccess, deleteItemAccess,
  loadInboxState, saveInboxChoice, clearInboxChoice,
  upsertTask, deleteTaskRow, loadWorkspacePeople, upsertAgendaPoint, deleteAgendaPointRow,
  type AccessGrant, type PreviewMember,
  upsertClient, deleteClient as dbDeleteClient, setCalendarToken, saveSetupSkipped,
  upsertTrack, deleteTrack as dbDeleteTrack,
  upsertAlbum, deleteAlbum as dbDeleteAlbum, upsertChecklist,
  upsertPerson, deletePerson as dbDeletePerson,
  upsertStakeholder, deleteStakeholder as dbDeleteStakeholder,
  upsertShow, deleteShow as dbDeleteShow,
  upsertOffer, deleteOffer as dbDeleteOffer,
  insertOfferSheet, answerOfferSheet as dbAnswerOfferSheet, withdrawOfferSheets,
  insertSettlement, updateSettlementPayments, deleteSettlementRow,
  upsertExpense, deleteExpense as dbDeleteExpense,
  upsertVendor, deleteVendor as dbDeleteVendor,
  upsertRun, deleteRun as dbDeleteRun, upsertBudget, deleteBudget as dbDeleteBudget, upsertCrewRate, upsertFinanceSettings,
  upsertVenue, deleteVenue as dbDeleteVenue, upsertArtistProfile, upsertAccounts, deleteAccountRow,
  upsertPost, deletePost as dbDeletePost, replaceAutoPosts,
  upsertDeposit, deleteDeposit as dbDeleteDeposit,
  upsertRoyaltyStream, deleteRoyaltyStream as dbDeleteRoyaltyStream,
  upsertProject, deleteProject as dbDeleteProject,
  upsertArtistTodo, deleteArtistTodo as dbDeleteArtistTodo,
  upsertCrewMember, deleteCrewMember as dbDeleteCrewMember,
  upsertAdvance, deleteAdvance as dbDeleteAdvance,
  upsertGuestListEntry, deleteGuestListEntry as dbDeleteGuestListEntry,
  upsertTravelItem, deleteTravelItem as dbDeleteTravelItem,
  upsertCatalogWork, deleteCatalogWork as dbDeleteCatalogWork,
  linkBankTransaction,
  upsertInvoice, deleteInvoice as dbDeleteInvoice,
  loadLegalTemplates, upsertLegalTemplate, deleteLegalTemplate as dbDeleteLegalTemplate,
  upsertTrackRound, deleteTrackRound as dbDeleteTrackRound,
  upsertTrackNote, deleteTrackNote as dbDeleteTrackNote,
  addTrackNoteReply as dbAddTrackNoteReply,
  replaceTrackCredits, uploadTrackAudio, deleteTrackAudio,
} from '@/lib/db'

// ── Persistence helpers ─────────────────────────────────────
const STORAGE_KEY = 'studio-v1'

// The store's initial state must be IDENTICAL on the server (which has no
// localStorage) and on the client's first paint, or React's hydration
// bails out and remounts the whole tree. So the synchronous initial value
// is always the deterministic demo snapshot; any real localStorage content
// (demo-mode's persisted edits) is loaded afterward, client-only, via
// hydrateLocalData() — see AuthProvider's demo-mode branch.
function defaultData(): AppData {
  return JSON.parse(JSON.stringify(DEMO_DATA))
}

function loadLocalData(): AppData {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return defaultData()
}

// Demo mode (no database) keeps its sample data in the browser. Once a real workspace is loaded, nothing
// is copied there: artists' finances and offers would otherwise sit unscrambled in browser storage.
let keepLocalCopy = true
const clearLocalCopies = () => {
  try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem('studio-legal-templates-v1') } catch { /* ignore */ }
}

function saveData(data: AppData) {
  if (typeof window === 'undefined' || !keepLocalCopy) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// Legal templates are workspace-wide rather than nested in AppData (most
// store actions rebuild `data` as `{ clients: ... }` from scratch, which
// would silently drop any sibling field), so they get their own small
// local-storage slot alongside the same persistence pattern.
const LEGAL_TEMPLATES_KEY = 'studio-legal-templates-v1'

function defaultLegalTemplates(): LegalTemplate[] {
  return JSON.parse(JSON.stringify(DEFAULT_LEGAL_TEMPLATES))
}

function loadLocalLegalTemplates(): LegalTemplate[] {
  try {
    const saved = localStorage.getItem(LEGAL_TEMPLATES_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return defaultLegalTemplates()
}

function saveLegalTemplatesLocal(templates: LegalTemplate[]) {
  if (typeof window === 'undefined' || !keepLocalCopy) return
  localStorage.setItem(LEGAL_TEMPLATES_KEY, JSON.stringify(templates))
}

// Fire-and-forget push to a client's connected Google Calendar, if any —
// the actual sync work happens server-side (this file runs in the
// browser and can't hold Google credentials), see
// src/app/api/google-calendar/push[-delete]/route.ts. A failed push never
// blocks or fails the local save; it's already persisted regardless.
function pushToGoogleCalendar(clientId: string, recordType: 'show' | 'post' | 'project', record: unknown) {
  fetch('/api/google-calendar/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, recordType, record }),
  }).catch(console.error)
}

function pushDeleteToGoogleCalendar(clientId: string, recordType: 'show' | 'post' | 'project', recordId: string) {
  fetch('/api/google-calendar/push-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, recordType, recordId }),
  }).catch(console.error)
}

// 'calendar' has no grant of its own (see hasAccess) — it's a read-only aggregate
// view gated per-event by the underlying section's own access, not a section
// anyone can be granted.
const ALL_SECTIONS: MainSection[] = ['songs', 'tour', 'content', 'finance', 'team', 'projects', 'analytics', 'legal', 'profile']

// ── State shape ─────────────────────────────────────────────
interface StudioState {
  // Data
  data: AppData
  // Shared document templates (NDA, split agreement, etc.) — workspace-wide,
  // not per-client, so kept separate from `data`.
  legalTemplates: LegalTemplate[]

  // Auth / workspace
  workspaceId: string | null
  userId: string | null
  isLoading: boolean

  // Role
  role: UserRole
  // The role a signed-in user is actually assigned in workspace_members —
  // null in demo mode. Only a real 'manager' may use the role switcher to
  // preview other roles' views; everyone else is locked to authRole.
  authRole: UserRole | null
  // Fixed client for an artist membership (real or previewed) — artists
  // never see a roster, only their own client.
  authClientId: string | null
  // Resolved access_grants rows for the active agent/lawyer/team identity
  // (real or previewed). Empty and unused for manager/artist roles.
  grants: AccessGrant[]
  // Other workspace members a manager can preview as — loaded once for
  // real managers only.
  previewMembers: PreviewMember[]
  previewMemberId: string | null
  // Per-item sharing exceptions (manager-only data) and each previewable
  // member's area grants - what the "Who can see this" control works from.
  itemAccess: ItemException[]
  memberGrants: Record<string, AccessGrant[]>
  // The manager's full data, set aside while previewing as someone else.
  previewBackup: AppData | null
  /** This person's Done / Snoozed choices in the Inbox, by item key. */
  inboxState: Record<string, InboxChoice>
  /** The teammates a to-do can be given to (empty for an artist's own login). */
  workspacePeople: WorkspacePerson[]
  /** Show screens that aren't connected to real data yet (kept per browser). */
  showUnfinished: boolean
  setShowUnfinished: (on: boolean) => void
  // Tour budgets (Stage 4): which budget is open, and live exchange rates (USD per unit)
  selectedBudgetId: string | null
  fxRates: FxRates

  // Navigation
  view: 'dashboard' | 'studio'
  clientId: string | null
  section: MainSection
  songsSub: SongsSub
  contentSub: ContentSub
  bizSub: BizSub
  tourSub: TourSub
  analyticsSub: AnalyticsSub
  legalSub: LegalSub
  selectedShowId: string | null
  /** Set by the ⌘K bar: the Offers screen opens its "paste an offer" box and clears this. */
  offerPasteRequest: boolean
  // Which release (single/EP/album) the Label Copy / Checklist / Status
  // sub-tabs are showing — mirrors selectedShowId's role for Tour.
  selectedAlbumId: string | null
  studioConcept: string | null

  // Calendar
  calYear: number
  calMonth: number

  // UI
  modal: string | null
  modalData: Record<string, unknown>
  openMenuId: string | null

  // ── Selectors ──
  getClient: (id?: string) => Client | undefined
  // Whether the active identity (real or previewed) can see — or edit — a
  // section for a client. Manager: always true. Artist: only their own
  // client, edit limited to 'projects' (the todo/request list). Agent/
  // lawyer/team: driven by resolved access_grants.
  hasAccess: (section: MainSection, clientId?: string, requireEdit?: boolean) => boolean
  // True when the person has no grant for the section but can load items in it
  // (they were shared) - they get a trimmed set of tabs and view-only access.
  isShareOnly: (section: MainSection, clientId?: string) => boolean
  loadMemberGrants: () => Promise<void>
  // effect null removes the exception (back to the person's normal access).
  setItemEffect: (clientId: string, itemType: ItemType, itemId: string, memberId: string, effect: ItemEffect | null) => void
  // Shorthand for hasAccess(section, undefined, true) against the current
  // client — what every Add/Edit/Delete button in a view should check.
  canEdit: (section: MainSection) => boolean
  // Client ids the active identity may see in a roster — 'all' for manager,
  // otherwise the specific set implied by grants/authClientId.
  accessibleClientIds: () => 'all' | string[]

  // ── Auth / Supabase init ──
  initFromSupabase: (userId: string) => Promise<void>
  // Demo mode only (no Supabase configured): loads whatever was previously
  // saved to localStorage, client-side, after the initial hydration pass.
  hydrateLocalData: () => void
  signOut: () => Promise<void>

  // ── Role ──
  // Manager-only: preview the app as another real workspace member, using
  // their actual role + access_grants. Pass null to return to Manager.
  previewAs: (memberId: string | null) => Promise<void>

  // ── Navigation actions ──
  goToDashboard: () => void
  openClient: (id: string) => void
  setSection: (section: MainSection) => void
  setSongsSub: (sub: SongsSub) => void
  setContentSub: (sub: ContentSub) => void
  setBizSub: (sub: BizSub) => void
  setTourSub: (sub: TourSub) => void
  setAnalyticsSub: (sub: AnalyticsSub) => void
  setLegalSub: (sub: LegalSub) => void
  setSelectedShow: (id: string | null) => void
  requestOfferPaste: () => void
  clearOfferPasteRequest: () => void
  setSelectedAlbum: (id: string | null) => void
  setStudioConcept: (name: string) => void
  calPrev: () => void
  calNext: () => void
  calToday: () => void

  // ── Modal ──
  openModal: (name: string, data?: Record<string, unknown>) => void
  closeModal: () => void
  setOpenMenu: (id: string | null) => void

  // ── Client CRUD ──
  addClient: (name: string, genre: string, color: string) => void
  updateClient: (id: string, name: string, genre: string, color: string) => void
  deleteClient: (id: string) => void

  // ── Calendar feed (per-client .ics subscription link) ──
  enableCalendarFeed: (clientId: string) => void
  // Marks first-day checklist steps as "doesn't apply to this artist" (shared with the team).
  setSetupSkipped: (clientId: string, keys: string[]) => void
  disableCalendarFeed: (clientId: string) => void

  // ── Track actions ──
  addTrack: (albumId: string, title: string, stage: Stage) => void

  // ── Releases (albums) — a client can have several: singles, EPs, albums ──
  addAlbum: (title: string, type: ReleaseType) => void
  updateAlbumMeta: (albumId: string, patch: { title?: string; type?: ReleaseType }) => void
  deleteAlbum: (albumId: string) => void
  advanceTrack: (trackId: string) => void
  deleteTrack: (trackId: string) => void
  updateTrackDetails: (trackId: string, patch: { title?: string; notes?: string; priority?: TrackPriority; owner?: string; dueDate?: string; stage?: Stage; releaseDate?: string; lyrics?: string; mixerBrief?: string }) => void
  updateTrackLabelCopy: (trackId: string, patch: TrackLabelCopy) => void
  updateAlbumLabelCopy: (albumId: string, patch: ReleaseLabelCopy) => void
  scheduleRelease: (albumId: string, releaseDate: string) => void
  toggleChecklistItem: (albumId: string, key: ChecklistItemKey) => void
  updateChecklistNote: (albumId: string, key: ChecklistItemKey, note: string) => void

  // ── Track audio rounds / review threads / credits ──
  /** Uploads the audio file to storage and adds a new round to the track. */
  /** Returns the new round's id (or undefined if no client is selected). */
  addTrackRound: (trackId: string, label: string, stage: Stage, file: File, duration?: number) => Promise<string | undefined>
  deleteTrackRound: (trackId: string, roundId: string) => void
  addTrackNote: (trackId: string, roundId: string, timestamp: number, author: string, text: string) => void
  toggleTrackNoteResolved: (trackId: string, roundId: string, noteId: string) => void
  deleteTrackNote: (trackId: string, roundId: string, noteId: string) => void
  addTrackNoteReply: (trackId: string, roundId: string, noteId: string, author: string, text: string) => void
  updateTrackCredits: (trackId: string, credits: TrackCredit[]) => void

  // ── People (shared directory) ──
  addPerson: (patch: { name: string; email?: string; phone?: string; org?: string; notes?: string }) => string
  updatePerson: (personId: string, patch: { name?: string; email?: string; phone?: string; org?: string; notes?: string; activity?: PersonActivity[] }) => void
  deletePerson: (personId: string) => void

  // ── Bank accounts (Plaid) ──
  /** Re-reads bank_accounts/bank_transactions for one client from Supabase — call after connecting or syncing a bank. */
  loadBankData: (clientId: string) => Promise<void>
  /** Manually confirms a bank transaction as income for a song, or unlinks it (pass null). */
  linkTransactionToCatalogWork: (transactionId: string, catalogWorkId: string | null) => void
  /** Manually confirms a bank transaction as the payment for an invoice — marks it paid using the transaction's real date. */
  linkTransactionToInvoice: (transactionId: string, invoiceId: string | null) => void

  // ── Catalog ──
  addCatalogWork: (patch: { title: string; ipi?: string; writers: string; currency: Currency; bmi?: RegStatus; mlc?: RegStatus; sx?: RegStatus; ppl?: RegStatus }) => void
  updateCatalogWork: (workId: string, patch: { title: string; ipi?: string; writers: string; currency: Currency; bmi: RegStatus; mlc: RegStatus; sx: RegStatus; ppl: RegStatus }) => void
  deleteCatalogWork: (workId: string) => void

  // ── Invoices ──
  addInvoice: (patch: { number: string; to: string; toEmail?: string; category: RevenueStream; currency: Currency; issuedDate: string; dueDate: string; items: InvoiceLineItem[]; notes?: string }) => void
  updateInvoiceStatus: (invoiceId: string, status: InvoiceStatus) => void
  deleteInvoice: (invoiceId: string) => void

  // ── Release stakeholders ──
  addStakeholder: (albumId: string, patch: { personId: string; role: StakeholderRole; notes?: string }) => void
  deleteStakeholder: (stakeholderId: string) => void

  // ── Guest list ──
  addGuest: (showId: string, name: string, qty: number, category: GuestListCategory, credential?: string, notes?: string) => void
  updateGuest: (guestId: string, patch: { name: string; qty: number; category: GuestListCategory; credential?: string; notes?: string }) => void
  toggleGuestCheckedIn: (guestId: string) => void
  deleteGuest: (guestId: string) => void

  // ── Crew ──
  /** Inserts when the id is new, replaces when it already exists. */
  saveCrewMember: (member: CrewMember, rate?: CrewRate) => void
  deleteCrewMember: (memberId: string) => void

  // ── Show advances ──
  /** Inserts when the id is new, replaces when it already exists. */
  saveAdvance: (advance: ShowAdvance) => void
  deleteAdvance: (advanceId: string) => void

  // ── Travel ──
  /** Inserts when the id is new, replaces when it already exists. */
  saveTravelItem: (item: TravelItem) => void
  deleteTravelItem: (itemId: string) => void

  // ── Show actions ──
  addShow: (date: string, city: string, venue: string, time: string) => void
  // Adds many shows at once (the spreadsheet import). Resolves with how many were saved and how many weren't.
  importShows: (shows: Show[]) => Promise<{ saved: number; failed: number }>
  updateShowStatus: (showId: string, status: ShowStatus) => void
  updateShowFinancials: (showId: string, patch: { guarantee?: number; deposit?: number; currency?: Currency; viaAgency?: boolean; agencyName?: string; agencyCommissionPct?: number; managementCommissionPct?: number; historyOnly?: boolean; driveUrl?: string }) => void
  /** No-ops if the show has no guarantee yet, or already has a generated invoice. */
  generateInvoiceFromShow: (showId: string) => void
  deleteShow: (showId: string) => void

  // ── Tour offers ──
  addOffer: (patch: { venue: string; city: string; country: string; date: string; promoter: string; guarantee: number; door?: number; buyout?: number; notes?: string; viaAgency?: boolean; agencyName?: string; agencyCommissionPct?: number; managementCommissionPct?: number; terms?: OfferTerms }) => void
  /** Editing an offer's status into 'confirmed' also creates the matching Show. */
  updateOffer: (offerId: string, patch: Partial<Omit<TourOffer, 'id'>>) => void
  deleteOffer: (offerId: string) => void
  /** Freezes the offer + its budget into a numbered sheet for the artist. Resolves once it is saved. */
  sendOfferSheet: (offerId: string, opts: { detail: OfferSheetDetail; message?: string }) => Promise<{ ok: true; sheetId: string } | { ok: false; error: string }>
  /** The artist's own answer to a sheet that is waiting for one. */
  answerOfferSheet: (sheetId: string, response: 'approved' | 'passed', note?: string) => Promise<{ ok: true } | { ok: false; error: string }>

  // ── Expenses ──
  addExpense: (patch: Omit<Expense, 'id'>) => void
  updateExpense: (expenseId: string, patch: Partial<Omit<Expense, 'id'>>) => void
  deleteExpense: (expenseId: string) => void
  // A confirmed bill: saves the (new or updated) Vendor and the Expense that
  // points at it - vendor first, since expenses.vendor_id is a foreign key.
  addBill: (bill: { expense: Omit<Expense, 'id' | 'vendorId'>; vendor: Vendor }) => void
  updateVendor: (vendorId: string, patch: Partial<Omit<Vendor, 'id'>>) => void
  deleteVendor: (vendorId: string) => void

  // ── Runs, budgets, crew pay (Stage 4) ──
  addRun: (name: string) => string
  renameRun: (runId: string, name: string) => void
  deleteRun: (runId: string) => void
  setShowRun: (showId: string, runId: string | null) => void
  setCrewRate: (rate: CrewRate) => void
  setFinanceSettings: (settings: FinanceSettings) => void
  addBudget: (target: { showId?: string; offerId?: string }) => string | null
  updateBudget: (budgetId: string, patch: Partial<Pick<Budget, 'name' | 'currency' | 'lines' | 'commissions' | 'notes'>>) => void
  deleteBudget: (budgetId: string) => void
  setSelectedBudget: (id: string | null) => void
  loadFxRates: () => Promise<void>

  // ── Inbox (Stage 5) ──
  markInboxDone: (key: string) => void
  snoozeInboxItem: (key: string, untilIso: string) => void
  restoreInboxItem: (key: string) => void

  // ── To-dos (the Today list; see lib/tasks.ts) ──
  /** Adds a to-do for an artist and returns its id (so a toast can offer Undo), or null if it could not be added. */
  addTask: (clientId: string, patch: { title: string; dueDate?: string; assigneeId?: string; link?: { type: TaskLinkType; id: string }; notes?: string; source?: TaskSource }) => string | null
  toggleTask: (clientId: string, taskId: string) => void
  updateTask: (clientId: string, taskId: string, patch: { title?: string; dueDate?: string | null; assigneeId?: string | null; notes?: string | null }) => void
  deleteTask: (clientId: string, taskId: string) => void
  /** Internal: saves one changed to-do, undoing it on screen if the save fails. */
  applyTask: (clientId: string, after: Task, before: Task) => void

  // ── Agenda (talking points around one to-do or project; see lib/agenda.ts) ──
  /** Adds one point per line of text to an item's agenda (up to the limit). */
  addAgendaPoints: (clientId: string, itemType: AgendaItemType, itemId: string, texts: string[]) => void
  toggleAgendaPoint: (clientId: string, pointId: string) => void
  removeAgendaPoint: (clientId: string, pointId: string) => void
  /** Makes a point its own to-do (given to you, pointing at the same project or thing) and ticks the point off. */
  agendaPointToTodo: (clientId: string, pointId: string) => void

  // ── Settlements (Stage 4, Part 3) ──
  /** Saves a confirmed settlement for the chosen shows, freezing today's exchange rates into it. */
  confirmSettlement: (draft: SettlementDraft, opts: { showIds: string[]; filePath?: string; fileName?: string }) => Promise<{ ok: true; settlementId: string } | { ok: false; error: string }>
  addSettlementPayment: (settlementId: string, payment: SettlementPayment) => Promise<{ ok: true } | { ok: false; error: string }>
  deleteSettlement: (settlementId: string) => Promise<{ ok: true } | { ok: false; error: string }>

  // ── Artist profile (the open details; private ones never come through here) ──
  /** Merges the given details into the artist's profile and saves them. Resolves once the database has them. */
  saveProfile: (patch: Partial<ArtistProfile>) => Promise<{ ok: true } | { ok: false; error: string }>

  // ── Accounts list (where each login lives; never a password) ──
  /** Adds new accounts or updates existing ones (matched by id). Resolves once the database has them. */
  saveAccounts: (accounts: ArtistAccount[]) => Promise<{ ok: true } | { ok: false; error: string }>
  removeAccount: (accountId: string) => Promise<{ ok: true } | { ok: false; error: string }>

  // ── Venue library (reusable across shows at the same room) ──
  addVenue: (patch: Omit<Venue, 'id' | 'createdAt'>) => string
  updateVenue: (venueId: string, patch: Partial<Omit<Venue, 'id' | 'createdAt'>>) => void
  deleteVenue: (venueId: string) => void

  // ── Post actions ──
  addPost: (date: string, title: string, time: string, type: string) => void
  updatePost: (postId: string, patch: { date: string; title: string; time: string; type: string }) => void
  deletePost: (postId: string) => void

  // ── Royalties ──
  addRoyaltyStream: (name: string, type: string, amount: number, currency: Currency, period: string) => void
  deleteRoyaltyStream: (streamId: string) => void

  // ── Banking ──
  addDeposit: (name: string, date: string, amount: number, currency: Currency, mgmt: number, lawyer: number, taxes: number) => void
  markDepositDone: (depositId: string) => void
  dismissDeposit: (depositId: string) => void

  // ── Projects (manager-side) ──
  addProject: (title: string, type: ProjectType, assigneeId?: string, dueDate?: string, fromArtist?: boolean) => void
  updateProjectStatus: (projectId: string, status: ProjectStatus) => void
  assignProject: (projectId: string, assigneeId: string | null) => void
  deleteProject: (projectId: string) => void

  // ── Artist todos ──
  addArtistTodo: (title: string, dueDate?: string) => void
  toggleArtistTodo: (todoId: string) => void
  deleteArtistTodo: (todoId: string) => void

  // ── Legal templates (workspace-wide) ──
  addLegalTemplate: (name: string, description?: string) => void
  updateLegalTemplate: (templateId: string, patch: { name?: string; description?: string; clauses?: LegalTemplateClause[] }) => void
  deleteLegalTemplate: (templateId: string) => void
}

// ── Store ───────────────────────────────────────────────────
const now = new Date()

export const useStore = create<StudioState>((set, get) => ({
  data: defaultData(),
  legalTemplates: defaultLegalTemplates(),

  workspaceId: null,
  userId:      null,
  isLoading:   false,

  role:          'manager',
  authRole:      null,
  authClientId:  null,
  grants:        [],
  previewMembers: [],
  previewMemberId: null,
  itemAccess: [],
  memberGrants: {},
  previewBackup: null,
  inboxState: {},
  workspacePeople: [],
  showUnfinished: false,
  setShowUnfinished: (on) => {
    try { localStorage.setItem(SHOW_UNFINISHED_KEY, on ? '1' : '0') } catch { /* private window: it just won't be remembered */ }
    set({ showUnfinished: on })
  },
  selectedBudgetId: null,
  fxRates: {},

  view:          'dashboard',
  clientId:      null,
  section:       'songs',
  songsSub:      'tracks',
  contentSub:    'manage',
  bizSub:        'royalties',
  tourSub:       'tour',
  analyticsSub:  'overview',
  legalSub:      'pipeline',
  selectedShowId: null,
  offerPasteRequest: false,
  selectedAlbumId: null,
  studioConcept: null,

  calYear:  now.getFullYear(),
  calMonth: now.getMonth(),

  modal:      null,
  modalData:  {},
  openMenuId: null,

  // ── Selector ──
  getClient: (id) => {
    const { data, clientId } = get()
    return data.clients.find(c => c.id === (id ?? clientId))
  },

  hasAccess: (section, clientId, requireEdit = false) => {
    const s = get()
    const cid = clientId ?? s.clientId
    if (!cid) return false
    // Calendar has no grant of its own — anyone with the client open can see
    // it; what it actually shows is filtered per-event by each event's real
    // section access (see src/lib/calendar.ts), not gated here.
    if (section === 'calendar') return true
    // Activity has no grant of its own either: the database decides which entries a person may read.
    if (section === 'activity') return s.role !== 'artist'
    if (s.role === 'manager') return true
    if (s.role === 'artist') {
      if (s.authClientId !== cid) return false
      return requireEdit ? section === 'projects' : true
    }
    const key = SECTION_TO_GRANT_KEY[section]
    if (s.grants.some(g =>
      g.section === key && (g.clientId === null || g.clientId === cid) && (!requireEdit || g.canEdit)
    )) return true
    // A shared item opens its section for viewing only - never for editing.
    return !requireEdit && s.isShareOnly(section, cid)
  },

  isShareOnly: (section, clientId) => {
    const s = get()
    const cid = clientId ?? s.clientId
    if (!cid || s.role === 'manager' || s.role === 'artist' || section === 'calendar') return false
    const key = SECTION_TO_GRANT_KEY[section]
    const granted = s.grants.some(g => g.section === key && (g.clientId === null || g.clientId === cid))
    return !granted && !!s.data.clients.find(c => c.id === cid)?.itemSections?.includes(section)
  },

  canEdit: (section) => get().hasAccess(section, undefined, true),

  accessibleClientIds: () => {
    const s = get()
    if (s.role === 'manager') return 'all'
    if (s.role === 'artist') return s.authClientId ? [s.authClientId] : []
    const ids = new Set<string>()
    for (const g of s.grants) {
      if (g.clientId === null) return 'all'
      ids.add(g.clientId)
    }
    // Clients where something was shared with them also belong on their roster.
    for (const c of s.data.clients) if (c.itemSections?.length) ids.add(c.id)
    return Array.from(ids)
  },

  // ── Supabase init ──
  hydrateLocalData: () => {
    set({ data: loadLocalData(), legalTemplates: loadLocalLegalTemplates() })
  },

  initFromSupabase: async (userId) => {
    set({ isLoading: true, userId })
    try {
      const membership = await getMyMembership()
      if (!membership) {
        // New user with no workspace yet — workspace is created by DB trigger,
        // but may take a moment. Fall back to demo data.
        set({ isLoading: false })
        return
      }
      const { workspaceId, role, clientId: memberClientId, memberId } = membership
      const [appData, loadedTemplates] = await Promise.all([
        loadWorkspaceData(workspaceId),
        loadLegalTemplates(workspaceId),
      ])
      const hasClients = appData.clients.length > 0

      // First load for this workspace — seed the starter templates and
      // persist them so they're real, editable workspace rows from here on.
      let legalTemplates = loadedTemplates
      if (legalTemplates.length === 0) {
        legalTemplates = JSON.parse(JSON.stringify(DEFAULT_LEGAL_TEMPLATES))
        legalTemplates.forEach(t => upsertLegalTemplate(t, workspaceId).catch(console.error))
      }

      let grants: AccessGrant[] = []
      let previewMembers: PreviewMember[] = []
      let itemAccess: ItemException[] = []
      // Everyone except the artist has an inbox (the artist's login never sees money alerts).
      const inboxState = role === 'artist' ? {} : await loadInboxState().catch(e => { console.error(e); return {} as Record<string, InboxChoice> })
      const workspacePeople = role === 'artist' ? [] : await loadWorkspacePeople().catch(e => { console.error(e); return [] as WorkspacePerson[] })
      if (role === 'agent' || role === 'lawyer' || role === 'team') {
        grants = await getGrantsForMember(memberId)
      } else if (role === 'manager') {
        ;[previewMembers, itemAccess] = await Promise.all([getPreviewableMembers(workspaceId), loadItemAccess()])
      }

      set({
        workspaceId,
        isLoading: false,
        role,
        authRole: role,
        authClientId: memberClientId,
        grants,
        previewMembers,
        itemAccess,
        inboxState,
        workspacePeople,
        data: hasClients ? appData : { clients: [] },
        legalTemplates,
        // Artists land straight in their own client — no roster to pick from.
        ...(role === 'artist' && memberClientId
          ? { view: 'studio' as const, clientId: memberClientId }
          : {}),
      })
      // The database is the source of truth now: remove any old browser copy and stop making new ones.
      keepLocalCopy = false
      if (typeof window !== 'undefined') clearLocalCopies()
    } catch (err) {
      console.error('Failed to load from Supabase:', err)
      set({ isLoading: false })
    }
  },

  signOut: async () => {
    const { createClient } = await import('@/lib/supabase/client')
    await createClient().auth.signOut()
    clearLocalCopies()
    window.location.href = '/login'
  },

  // ── Role ──
  previewAs: async (memberId) => {
    const { previewBackup, workspaceId, itemAccess } = get()
    if (memberId === null) {
      // Back to the manager's own view. Reload, so anything edited while
      // previewing is reflected instead of the stale pre-preview copy.
      let data = previewBackup
      if (workspaceId) {
        try { data = await loadWorkspaceData(workspaceId) } catch (e) { console.error(e) }
      }
      set({
        role: 'manager', grants: [], authClientId: null, previewMemberId: null, view: 'dashboard',
        clientId: null, section: 'songs', previewBackup: null, ...(data ? { data } : {}),
      })
      return
    }
    const member = get().previewMembers.find(m => m.id === memberId)
    if (!member) return
    const grants = member.role === 'artist' ? [] : await getGrantsForMember(member.id)
    // A manager's own session can read every row, so the preview hides what
    // this person's login wouldn't get (the database does it for real logins).
    const base = previewBackup ?? get().data
    const viewer: Viewer = { memberId: member.id, role: member.role, clientId: member.clientId, grants, userId: get().workspacePeople.find(p => p.memberId === member.id)?.userId }
    set({
      role: member.role,
      grants,
      authClientId: member.clientId,
      previewMemberId: memberId,
      previewBackup: base,
      // Demo artists belong to their owner alone, so they never appear when previewing as someone else.
      data: { clients: base.clients.filter(c => !c.isDemo).map(c => filterClientForViewer(c, viewer, itemAccess)) },
      view: member.role === 'artist' ? 'studio' : 'dashboard',
      clientId: member.role === 'artist' ? member.clientId : null,
      section: 'songs',
    })
  },

  loadMemberGrants: async () => {
    const { previewMembers, memberGrants } = get()
    const missing = previewMembers.filter(m => m.role !== 'artist' && !memberGrants[m.id])
    if (missing.length === 0) return
    const loaded = await Promise.all(missing.map(async m => [m.id, await getGrantsForMember(m.id)] as const))
    set({ memberGrants: { ...get().memberGrants, ...Object.fromEntries(loaded) } })
  },

  setItemEffect: (clientId, itemType, itemId, memberId, effect) => {
    const before = get().itemAccess
    const existing = findException(before, memberId, itemType, itemId)
    if (effect === null) {
      if (!existing) return
      set({ itemAccess: before.filter(e => e.id !== existing.id) })
      deleteItemAccess(existing.id).catch(err => { console.error(err); set({ itemAccess: before }) })
      return
    }
    const next: ItemException = existing
      ? { ...existing, effect }
      : { id: 'acc-' + uid(), clientId, itemType, itemId, memberId, effect }
    set({ itemAccess: existing ? before.map(e => e.id === existing.id ? next : e) : [...before, next] })
    // Sharing is a security setting: if the save is rejected, put the switch back.
    upsertItemAccess(next).catch(err => { console.error(err); set({ itemAccess: before }) })
  },

  // ── Navigation ──
  goToDashboard: () => set({ view: 'dashboard', clientId: null, selectedShowId: null, selectedAlbumId: null }),
  openClient: (id) => {
    const s = get()
    const firstSection = (s.role === 'manager' || s.role === 'artist')
      ? 'calendar'
      : (ALL_SECTIONS.find(sec => s.hasAccess(sec, id)) ?? 'songs')
    set({ view: 'studio', clientId: id, section: firstSection, selectedShowId: null, selectedAlbumId: null })
  },
  setSection:    (section) => set({ section, selectedShowId: null }),
  setSongsSub:   (sub) => set({ songsSub: sub }),
  setContentSub: (sub) => set({ contentSub: sub }),
  setBizSub:       (sub) => set({ bizSub: sub }),
  setTourSub:      (sub) => set({ tourSub: sub }),
  setAnalyticsSub: (sub) => set({ analyticsSub: sub }),
  setLegalSub:     (sub) => set({ legalSub: sub }),
  setSelectedShow: (id) => set({ selectedShowId: id }),
  requestOfferPaste: () => set({ offerPasteRequest: true }),
  clearOfferPasteRequest: () => set({ offerPasteRequest: false }),
  setSelectedAlbum: (id) => set({ selectedAlbumId: id }),
  setStudioConcept: (name) => set({ studioConcept: name }),

  calPrev: () => set(s => {
    if (s.calMonth === 0) return { calMonth: 11, calYear: s.calYear - 1 }
    return { calMonth: s.calMonth - 1 }
  }),
  calNext: () => set(s => {
    if (s.calMonth === 11) return { calMonth: 0, calYear: s.calYear + 1 }
    return { calMonth: s.calMonth + 1 }
  }),
  calToday: () => {
    const n = new Date()
    set({ calYear: n.getFullYear(), calMonth: n.getMonth() })
  },

  // ── Modal ──
  openModal:  (name, data = {}) => set({ modal: name, modalData: data }),
  closeModal: () => set({ modal: null, modalData: {} }),
  setOpenMenu: (id) => set({ openMenuId: id }),

  // ── Client CRUD ──
  addClient: (name, genre, color) => {
    const { data, workspaceId } = get()
    const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + uid()
    const newClient: Client = {
      id, name, genre, color,
      people:      [],
      songs:       { albums: [{ id: 'alb-' + uid(), title: name + ' (untitled)', tracks: [], checklist: defaultChecklist() }] },
      tour:        { ...EMPTY_TOUR },
      content:     { posts: [] },
      business: {
        royalties: { streams: [] },
        banking:   { deposits: [], accounts: [], transactions: [] },
        catalog:   { works: [] },
      },
      projects:    [],
      artistTodos: [],
      analytics:   EMPTY_ANALYTICS,
      agentData:   EMPTY_AGENT,
      legal:       EMPTY_LEGAL,
      finance:     EMPTY_FINANCE,
    }
    const updated = { clients: [...data.clients, newClient] }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) {
      upsertClient(newClient, workspaceId).catch(console.error)
      const defaultAlbum = newClient.songs.albums[0]
      if (defaultAlbum.checklist) upsertChecklist(defaultAlbum.checklist, defaultAlbum.id).catch(console.error)
    }
  },

  updateClient: (id, name, genre, color) => {
    const { data, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => c.id === id ? { ...c, name, genre, color } : c),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) {
      const client = updated.clients.find(c => c.id === id)
      if (client) upsertClient(client, workspaceId).catch(console.error)
    }
  },

  deleteClient: (id) => {
    const { data } = get()
    const updated = { clients: data.clients.filter(c => c.id !== id) }
    set({ data: updated })
    saveData(updated)
    dbDeleteClient(id).catch(console.error)
  },

  // Regenerating (calling this again while already enabled) invalidates
  // the old link — useful if it ever leaked.
  enableCalendarFeed: (clientId) => {
    const { data, workspaceId } = get()
    const token = crypto.randomUUID()
    const updated = { clients: data.clients.map(c => c.id === clientId ? { ...c, calendarToken: token } : c) }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) setCalendarToken(clientId, token).catch(console.error)
  },

  setSetupSkipped: (clientId, keys) => {
    const { data, workspaceId } = get()
    const updated = { clients: data.clients.map(c => c.id === clientId ? { ...c, setupSkipped: keys.length > 0 ? keys : undefined } : c) }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) saveSetupSkipped(clientId, keys).catch(console.error)
  },

  disableCalendarFeed: (clientId) => {
    const { data, workspaceId } = get()
    const updated = { clients: data.clients.map(c => c.id === clientId ? { ...c, calendarToken: undefined } : c) }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) setCalendarToken(clientId, null).catch(console.error)
  },

  // ── Track actions ──
  addTrack: (albumId, title, stage) => {
    const { data, clientId } = get()
    const newTrack: Track = { id: 't-' + uid(), num: 0, title, stage, version: 1, touched: 'now' }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => {
              if (a.id !== albumId) return a
              const t: Track = { ...newTrack, num: a.tracks.length + 1 }
              upsertTrack(t, albumId).catch(console.error)
              return { ...a, tracks: [...a.tracks, t] }
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
  },

  addAlbum: (title, type) => {
    const { data, clientId, workspaceId } = get()
    const newAlbum: Album = { id: 'alb-' + uid(), title, type, tracks: [] }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, songs: { albums: [...c.songs.albums, newAlbum] } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) upsertAlbum(newAlbum, clientId).catch(console.error)
  },

  updateAlbumMeta: (albumId, patch) => {
    const { data, clientId, workspaceId } = get()
    let updatedAlbum: Album | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => {
              if (a.id !== albumId) return a
              updatedAlbum = { ...a, ...patch }
              return updatedAlbum
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId && updatedAlbum) upsertAlbum(updatedAlbum, clientId).catch(console.error)
  },

  deleteAlbum: (albumId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, songs: { albums: c.songs.albums.filter(a => a.id !== albumId) } }
      }),
    }
    set({ data: updated, selectedAlbumId: null })
    saveData(updated)
    dbDeleteAlbum(albumId).catch(console.error)
  },

  advanceTrack: (trackId) => {
    const stages: Stage[] = ['track', 'mix', 'master', 'done']
    const { data, clientId } = get()
    let updatedTrack: Track | undefined
    let updatedAlbumId: string | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              tracks: a.tracks.map(t => {
                if (t.id !== trackId) return t
                const idx = stages.indexOf(t.stage)
                if (idx < stages.length - 1) {
                  const next = { ...t, stage: stages[idx + 1] }
                  updatedTrack = next
                  updatedAlbumId = a.id
                  return next
                }
                return t
              }),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (updatedTrack && updatedAlbumId) {
      upsertTrack(updatedTrack, updatedAlbumId).catch(console.error)
    }
  },

  deleteTrack: (trackId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              tracks: a.tracks.filter(t => t.id !== trackId).map((t, i) => ({ ...t, num: i + 1 })),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteTrack(trackId).catch(console.error)
  },

  updateTrackDetails: (trackId, patch) => {
    const { data, clientId, workspaceId } = get()
    let updatedTrack: Track | undefined
    let updatedAlbumId: string | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              tracks: a.tracks.map(t => {
                if (t.id !== trackId) return t
                const next = { ...t, ...patch }
                updatedTrack = next
                updatedAlbumId = a.id
                return next
              }),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && updatedTrack && updatedAlbumId) upsertTrack(updatedTrack, updatedAlbumId).catch(console.error)
  },

  updateTrackLabelCopy: (trackId, patch) => {
    const { data, clientId, workspaceId } = get()
    let updatedTrack: Track | undefined
    let updatedAlbumId: string | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              tracks: a.tracks.map(t => {
                if (t.id !== trackId) return t
                const next = { ...t, labelCopy: { ...t.labelCopy, ...patch } }
                updatedTrack = next
                updatedAlbumId = a.id
                return next
              }),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && updatedTrack && updatedAlbumId) upsertTrack(updatedTrack, updatedAlbumId).catch(console.error)
  },

  updateAlbumLabelCopy: (albumId, patch) => {
    const { data, clientId, workspaceId } = get()
    let updatedAlbum: Album | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => {
              if (a.id !== albumId) return a
              const next = { ...a, labelCopy: { ...a.labelCopy, ...patch } }
              updatedAlbum = next
              return next
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId && updatedAlbum) upsertAlbum(updatedAlbum, clientId).catch(console.error)
  },

  scheduleRelease: (albumId, releaseDate) => {
    const { data, clientId, workspaceId } = get()
    let updatedAlbum: Album | undefined
    let generatedPosts: Post[] = []
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        const album = c.songs.albums.find(a => a.id === albumId)
        if (!album) return c
        const generated: Post[] = ROLLOUT_TEMPLATE.map(item => ({
          id: 'post-' + uid(),
          date: addDays(releaseDate, item.offset),
          title: item.title(album.title),
          time: item.time,
          type: item.type,
          releaseId: albumId,
          auto: true,
        }))
        generatedPosts = generated
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => {
              if (a.id !== albumId) return a
              const next = { ...a, releaseDate }
              updatedAlbum = next
              return next
            }),
          },
          content: {
            posts: [...c.content.posts.filter(p => !(p.auto && p.releaseId === albumId)), ...generated],
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId && updatedAlbum) {
      upsertAlbum(updatedAlbum, clientId).catch(console.error)
      replaceAutoPosts(generatedPosts, clientId, albumId).catch(console.error)
    }
  },

  toggleChecklistItem: (albumId, key) => {
    const { data, clientId, workspaceId } = get()
    let updatedItems: ChecklistItem[] | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => {
              if (a.id !== albumId) return a
              const items = a.checklist && a.checklist.length ? a.checklist : defaultChecklist()
              const next = items.map(i => i.key === key ? { ...i, done: !i.done } : i)
              updatedItems = next
              return { ...a, checklist: next }
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && updatedItems) upsertChecklist(updatedItems, albumId).catch(console.error)
  },

  updateChecklistNote: (albumId, key, note) => {
    const { data, clientId, workspaceId } = get()
    let updatedItems: ChecklistItem[] | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => {
              if (a.id !== albumId) return a
              const items = a.checklist && a.checklist.length ? a.checklist : defaultChecklist()
              const next = items.map(i => i.key === key ? { ...i, note } : i)
              updatedItems = next
              return { ...a, checklist: next }
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && updatedItems) upsertChecklist(updatedItems, albumId).catch(console.error)
  },

  // ── Track audio rounds / review threads / credits ──
  addTrackRound: async (trackId, label, stage, file, duration) => {
    const { data, clientId, workspaceId } = get()
    if (!clientId) return
    const roundId = 'round-' + uid()
    let audioPath: string | undefined
    if (workspaceId) {
      try {
        audioPath = await uploadTrackAudio(file, clientId, trackId, roundId)
      } catch (err) {
        console.error(err)
        return
      }
    }
    const newRound: TrackRound = {
      id: roundId, label, stage, audioPath, duration,
      notes: [], createdAt: new Date().toISOString(),
    }
    let roundCount = 0
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              tracks: a.tracks.map(t => {
                if (t.id !== trackId) return t
                const rounds = [...(t.rounds ?? []), newRound]
                roundCount = rounds.length
                return { ...t, rounds }
              }),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) upsertTrackRound(newRound, trackId, roundCount - 1).catch(console.error)
    return roundId
  },

  deleteTrackRound: (trackId, roundId) => {
    const { data, clientId } = get()
    let removedPath: string | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              tracks: a.tracks.map(t => {
                if (t.id !== trackId) return t
                const removed = (t.rounds ?? []).find(r => r.id === roundId)
                if (removed) removedPath = removed.audioPath
                return { ...t, rounds: (t.rounds ?? []).filter(r => r.id !== roundId) }
              }),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteTrackRound(roundId).catch(console.error)
    if (removedPath) deleteTrackAudio(removedPath).catch(console.error)
  },

  addTrackNote: (trackId, roundId, timestamp, author, text) => {
    const { data, clientId, workspaceId } = get()
    if (!text.trim()) return
    const newNote: TrackNote = {
      id: 'note-' + uid(), timestamp, author, text: text.trim(),
      resolved: false, replies: [], createdAt: new Date().toISOString(),
    }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              tracks: a.tracks.map(t => {
                if (t.id !== trackId) return t
                return {
                  ...t,
                  rounds: (t.rounds ?? []).map(r => r.id !== roundId ? r : { ...r, notes: [...r.notes, newNote] }),
                }
              }),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) upsertTrackNote(newNote, roundId).catch(console.error)
  },

  toggleTrackNoteResolved: (trackId, roundId, noteId) => {
    const { data, clientId, workspaceId } = get()
    let updatedNote: TrackNote | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              tracks: a.tracks.map(t => {
                if (t.id !== trackId) return t
                return {
                  ...t,
                  rounds: (t.rounds ?? []).map(r => {
                    if (r.id !== roundId) return r
                    return {
                      ...r,
                      notes: r.notes.map(n => {
                        if (n.id !== noteId) return n
                        updatedNote = { ...n, resolved: !n.resolved }
                        return updatedNote
                      }),
                    }
                  }),
                }
              }),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && updatedNote) upsertTrackNote(updatedNote, roundId).catch(console.error)
  },

  deleteTrackNote: (trackId, roundId, noteId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              tracks: a.tracks.map(t => {
                if (t.id !== trackId) return t
                return {
                  ...t,
                  rounds: (t.rounds ?? []).map(r => r.id !== roundId ? r : { ...r, notes: r.notes.filter(n => n.id !== noteId) }),
                }
              }),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteTrackNote(noteId).catch(console.error)
  },

  addTrackNoteReply: (trackId, roundId, noteId, author, text) => {
    const { data, clientId, workspaceId } = get()
    if (!text.trim()) return
    const newReply: TrackNoteReply = { id: 'reply-' + uid(), author, text: text.trim(), createdAt: new Date().toISOString() }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              tracks: a.tracks.map(t => {
                if (t.id !== trackId) return t
                return {
                  ...t,
                  rounds: (t.rounds ?? []).map(r => {
                    if (r.id !== roundId) return r
                    return {
                      ...r,
                      notes: r.notes.map(n => n.id !== noteId ? n : { ...n, replies: [...n.replies, newReply] }),
                    }
                  }),
                }
              }),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) dbAddTrackNoteReply(newReply, noteId).catch(console.error)
  },

  updateTrackCredits: (trackId, credits) => {
    const { data, clientId, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              tracks: a.tracks.map(t => t.id !== trackId ? t : { ...t, credits }),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) replaceTrackCredits(trackId, credits).catch(console.error)
  },

  // ── Guest list ──
  addGuest: (showId, name, qty, category, credential, notes) => {
    const { data, clientId, workspaceId } = get()
    const newGuest: GuestListEntry = { id: 'gl-' + uid(), showId, name, qty, category, checkedIn: false, credential, notes }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, tour: { ...c.tour, guestList: [...(c.tour.guestList ?? []), newGuest] } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) upsertGuestListEntry(newGuest).catch(console.error)
  },

  updateGuest: (guestId, patch) => {
    const { data, clientId, workspaceId } = get()
    let updatedGuest: GuestListEntry | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          tour: {
            ...c.tour,
            guestList: (c.tour.guestList ?? []).map(g => {
              if (g.id !== guestId) return g
              updatedGuest = { ...g, ...patch }
              return updatedGuest
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && updatedGuest) upsertGuestListEntry(updatedGuest).catch(console.error)
  },

  toggleGuestCheckedIn: (guestId) => {
    const { data, clientId, workspaceId } = get()
    let toggled: GuestListEntry | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          tour: {
            ...c.tour,
            guestList: (c.tour.guestList ?? []).map(g => {
              if (g.id !== guestId) return g
              toggled = { ...g, checkedIn: !g.checkedIn }
              return toggled
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && toggled) upsertGuestListEntry(toggled).catch(console.error)
  },

  deleteGuest: (guestId) => {
    const { data, clientId, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, tour: { ...c.tour, guestList: (c.tour.guestList ?? []).filter(g => g.id !== guestId) } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) dbDeleteGuestListEntry(guestId).catch(console.error)
  },

  // ── Crew ──
  saveCrewMember: (member, rate) => {
    const { data, clientId, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        const crew = c.tour.crew ?? []
        const exists = crew.some(m => m.id === member.id)
        const rates = c.finance.crewRates ?? []
        return {
          ...c,
          tour: {
            ...c.tour,
            crew: exists ? crew.map(m => m.id === member.id ? member : m) : [...crew, member],
          },
          finance: rate
            ? { ...c.finance, crewRates: rates.some(r => r.crewMemberId === rate.crewMemberId) ? rates.map(r => r.crewMemberId === rate.crewMemberId ? rate : r) : [...rates, rate] }
            : c.finance,
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    // The pay row points at the crew row (foreign key), so the crew member goes first.
    if (workspaceId && clientId) {
      upsertCrewMember(member, clientId)
        .then(() => { if (rate) return upsertCrewRate(rate, clientId) })
        .catch(console.error)
    }
  },

  deleteCrewMember: (memberId) => {
    const { data, clientId, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, tour: { ...c.tour, crew: (c.tour.crew ?? []).filter(m => m.id !== memberId) } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) dbDeleteCrewMember(memberId).catch(console.error)
  },

  // ── Show advances ──
  saveAdvance: (advance) => {
    const { data, clientId, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        const advances = c.tour.advances ?? []
        const exists = advances.some(a => a.id === advance.id)
        return {
          ...c,
          tour: {
            ...c.tour,
            advances: exists ? advances.map(a => a.id === advance.id ? advance : a) : [...advances, advance],
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) upsertAdvance(advance).catch(console.error)
  },

  deleteAdvance: (advanceId) => {
    const { data, clientId, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, tour: { ...c.tour, advances: (c.tour.advances ?? []).filter(a => a.id !== advanceId) } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) dbDeleteAdvance(advanceId).catch(console.error)
  },

  // ── Travel ──
  saveTravelItem: (item) => {
    const { data, clientId, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        const travel = c.tour.travel ?? []
        const exists = travel.some(t => t.id === item.id)
        return {
          ...c,
          tour: {
            ...c.tour,
            travel: exists ? travel.map(t => t.id === item.id ? item : t) : [...travel, item],
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) upsertTravelItem(item, clientId).catch(console.error)
  },

  deleteTravelItem: (itemId) => {
    const { data, clientId, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, tour: { ...c.tour, travel: (c.tour.travel ?? []).filter(t => t.id !== itemId) } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) dbDeleteTravelItem(itemId).catch(console.error)
  },

  // ── Release stakeholders ──
  // ── People (shared directory) ──
  addPerson: (patch) => {
    const { data, clientId, workspaceId } = get()
    const newPerson: Person = { id: 'person-' + uid(), ...patch }
    const updated = {
      clients: data.clients.map(c => c.id !== clientId ? c : { ...c, people: [...(c.people ?? []), newPerson] }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) upsertPerson(newPerson, clientId).catch(console.error)
    return newPerson.id
  },

  updatePerson: (personId, patch) => {
    const { data, clientId, workspaceId } = get()
    let updatedPerson: Person | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          people: (c.people ?? []).map(p => {
            if (p.id !== personId) return p
            const next = { ...p, ...patch }
            updatedPerson = next
            return next
          }),
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId && updatedPerson) upsertPerson(updatedPerson, clientId).catch(console.error)
  },

  deletePerson: (personId) => {
    const { data, clientId, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          people: (c.people ?? []).filter(p => p.id !== personId),
          tour: { ...c.tour, crew: c.tour.crew.filter(cm => cm.personId !== personId) },
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              stakeholders: (a.stakeholders ?? []).filter(s => s.personId !== personId),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) dbDeletePerson(personId).catch(console.error)
  },

  loadBankData: async (clientId) => {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    const [accountsRes, txRes] = await Promise.all([
      supabase.from('bank_accounts').select('*').eq('client_id', clientId),
      supabase.from('bank_transactions').select('*').eq('client_id', clientId).order('date', { ascending: false }),
    ])
    const accounts = (accountsRes.data ?? []).map(a => ({
      id: a.id, name: a.name, officialName: a.official_name ?? undefined,
      mask: a.mask ?? undefined, type: a.type ?? undefined, subtype: a.subtype ?? undefined,
      currency: (a.currency ?? undefined) as Currency | undefined,
      currentBalance: a.current_balance ?? undefined, availableBalance: a.available_balance ?? undefined,
    }))
    const transactions = (txRes.data ?? []).map(t => ({
      id: t.id, accountId: t.account_id, date: t.date, name: t.name,
      merchantName: t.merchant_name ?? undefined, amount: t.amount,
      currency: (t.currency ?? undefined) as Currency | undefined,
      category: t.category ?? undefined, pending: t.pending,
      catalogWorkId: t.catalog_work_id ?? undefined, invoiceId: t.invoice_id ?? undefined,
    }))
    set(state => ({
      data: {
        clients: state.data.clients.map(c => c.id !== clientId ? c : {
          ...c,
          business: { ...c.business, banking: { ...c.business.banking, accounts, transactions } },
        }),
      },
    }))
  },

  linkTransactionToCatalogWork: (transactionId, catalogWorkId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          business: {
            ...c.business,
            banking: {
              ...c.business.banking,
              transactions: c.business.banking.transactions.map(t =>
                t.id === transactionId ? { ...t, catalogWorkId: catalogWorkId ?? undefined } : t
              ),
            },
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    linkBankTransaction(transactionId, { catalogWorkId }).catch(console.error)
  },

  linkTransactionToInvoice: (transactionId, invoiceId) => {
    const { data, clientId } = get()
    const client = data.clients.find(c => c.id === clientId)
    const transaction = client?.business.banking.transactions.find(t => t.id === transactionId)
    // Unlinking removes the proof this invoice was paid, so its status reverts too —
    // a "paid" invoice with no linked transaction behind it would be misleading.
    const affectedInvoiceId = invoiceId ?? transaction?.invoiceId
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          business: {
            ...c.business,
            banking: {
              ...c.business.banking,
              transactions: c.business.banking.transactions.map(t =>
                t.id === transactionId ? { ...t, invoiceId: invoiceId ?? undefined } : t
              ),
            },
          },
          finance: !affectedInvoiceId || !c.finance ? c.finance : {
            ...c.finance,
            invoices: c.finance.invoices.map(inv =>
              inv.id !== affectedInvoiceId ? inv
              : invoiceId
                ? { ...inv, status: 'paid' as const, paidDate: transaction?.date ?? inv.paidDate }
                : { ...inv, status: 'sent' as const, paidDate: undefined }
            ),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    linkBankTransaction(transactionId, { invoiceId }).catch(console.error)
    if (affectedInvoiceId) {
      const invoice = updated.clients.find(c => c.id === clientId)?.finance?.invoices.find(i => i.id === affectedInvoiceId)
      if (invoice) upsertInvoice(invoice, clientId!).catch(console.error)
    }
  },

  addCatalogWork: (patch) => {
    const { data, clientId, workspaceId } = get()
    const work: CatalogWork = {
      id: 'work-' + uid(),
      title: patch.title, ipi: patch.ipi, writers: patch.writers,
      amount: 0, currency: patch.currency,
      bmi: patch.bmi ?? 'q', mlc: patch.mlc ?? 'q', sx: patch.sx ?? 'q', ppl: patch.ppl ?? 'q',
    }
    const updated = {
      clients: data.clients.map(c => c.id !== clientId ? c : {
        ...c,
        business: { ...c.business, catalog: { works: [...c.business.catalog.works, work] } },
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) upsertCatalogWork(work, clientId).catch(console.error)
  },

  updateCatalogWork: (workId, patch) => {
    const { data, clientId, workspaceId } = get()
    let updatedWork: CatalogWork | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          business: {
            ...c.business,
            catalog: {
              works: c.business.catalog.works.map(w => {
                if (w.id !== workId) return w
                updatedWork = { ...w, ...patch }
                return updatedWork
              }),
            },
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId && updatedWork) upsertCatalogWork(updatedWork, clientId).catch(console.error)
  },

  deleteCatalogWork: (workId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          business: {
            ...c.business,
            catalog: { works: c.business.catalog.works.filter(w => w.id !== workId) },
            banking: {
              ...c.business.banking,
              transactions: c.business.banking.transactions.map(t =>
                t.catalogWorkId === workId ? { ...t, catalogWorkId: undefined } : t
              ),
            },
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteCatalogWork(workId).catch(console.error)
  },

  addInvoice: (patch) => {
    const { data, clientId, workspaceId } = get()
    const invoice: Invoice = {
      id: 'inv-' + uid(),
      number: patch.number, to: patch.to, toEmail: patch.toEmail,
      category: patch.category, status: 'draft',
      issuedDate: patch.issuedDate, dueDate: patch.dueDate,
      items: patch.items, currency: patch.currency, notes: patch.notes,
    }
    const updated = {
      clients: data.clients.map(c => c.id !== clientId ? c : {
        ...c,
        finance: { ...c.finance, invoices: [...(c.finance?.invoices ?? []), invoice] },
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) upsertInvoice(invoice, clientId).catch(console.error)
  },

  updateInvoiceStatus: (invoiceId, status) => {
    const { data, clientId, workspaceId } = get()
    let updatedInvoice: Invoice | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.finance) return c
        return {
          ...c,
          finance: {
            ...c.finance,
            invoices: c.finance.invoices.map(inv => {
              if (inv.id !== invoiceId) return inv
              updatedInvoice = { ...inv, status }
              return updatedInvoice
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId && updatedInvoice) upsertInvoice(updatedInvoice, clientId).catch(console.error)
  },

  deleteInvoice: (invoiceId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.finance) return c
        return { ...c, finance: { ...c.finance, invoices: c.finance.invoices.filter(inv => inv.id !== invoiceId) } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteInvoice(invoiceId).catch(console.error)
  },

  // ── Expenses ──
  addExpense: (patch) => {
    const { data, clientId, workspaceId } = get()
    const newExpense: Expense = { id: 'exp-' + uid(), ...patch }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.finance) return c
        return { ...c, finance: { ...c.finance, expenses: [...c.finance.expenses, newExpense] } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) upsertExpense(newExpense, clientId).catch(console.error)
  },

  updateExpense: (expenseId, patch) => {
    const { data, clientId, workspaceId } = get()
    let updatedExpense: Expense | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.finance) return c
        return {
          ...c,
          finance: {
            ...c.finance,
            expenses: c.finance.expenses.map(e => {
              if (e.id !== expenseId) return e
              updatedExpense = { ...e, ...patch }
              return updatedExpense
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId && updatedExpense) upsertExpense(updatedExpense, clientId).catch(console.error)
  },

  deleteExpense: (expenseId) => {
    const { data, clientId } = get()
    const removed = data.clients.find(c => c.id === clientId)?.finance?.expenses.find(e => e.id === expenseId)
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.finance) return c
        return { ...c, finance: { ...c.finance, expenses: c.finance.expenses.filter(e => e.id !== expenseId) } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteExpense(expenseId).catch(console.error)
    if (removed?.billFilePath && clientId) {
      fetch('/api/bills/file', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, path: removed.billFilePath }),
      }).catch(console.error)
    }
  },

  addBill: ({ expense, vendor }) => {
    const { data, clientId, workspaceId } = get()
    const newExpense: Expense = { id: 'exp-' + uid(), ...expense, vendorId: vendor.id }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.finance) return c
        const vendors = c.finance.vendors ?? []
        const nextVendors = vendors.some(v => v.id === vendor.id)
          ? vendors.map(v => v.id === vendor.id ? vendor : v)
          : [...vendors, vendor]
        return { ...c, finance: { ...c.finance, vendors: nextVendors, expenses: [...c.finance.expenses, newExpense] } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) {
      upsertVendor(vendor, clientId).then(() => upsertExpense(newExpense, clientId)).catch(console.error)
    }
  },

  updateVendor: (vendorId, patch) => {
    const { data, clientId, workspaceId } = get()
    let updatedVendor: Vendor | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.finance) return c
        return {
          ...c,
          finance: {
            ...c.finance,
            vendors: (c.finance.vendors ?? []).map(v => {
              if (v.id !== vendorId) return v
              updatedVendor = { ...v, ...patch }
              return updatedVendor
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId && updatedVendor) upsertVendor(updatedVendor, clientId).catch(console.error)
  },

  deleteVendor: (vendorId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.finance) return c
        return {
          ...c,
          finance: {
            ...c.finance,
            vendors: (c.finance.vendors ?? []).filter(v => v.id !== vendorId),
            expenses: c.finance.expenses.map(e => e.vendorId === vendorId ? { ...e, vendorId: undefined } : e),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteVendor(vendorId).catch(console.error)
  },

  // ── Release stakeholders ──
  addStakeholder: (albumId, patch) => {
    const { data, clientId, workspaceId } = get()
    const newStakeholder: ReleaseStakeholder = { id: 'sh-' + uid(), ...patch }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a =>
              a.id !== albumId ? a : { ...a, stakeholders: [...(a.stakeholders ?? []), newStakeholder] }
            ),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) upsertStakeholder(newStakeholder, albumId).catch(console.error)
  },

  deleteStakeholder: (stakeholderId) => {
    const { data, clientId, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              stakeholders: (a.stakeholders ?? []).filter(s => s.id !== stakeholderId),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId) dbDeleteStakeholder(stakeholderId).catch(console.error)
  },

  // ── Show actions ──
  addShow: (date, city, venue, time) => {
    const { data, clientId } = get()
    const newShow: Show = { id: 'show-' + uid(), date, city, venue, time, status: 'hold' }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        const shows = [...c.tour.shows, newShow].sort((a, b) => a.date.localeCompare(b.date))
        return { ...c, tour: { ...c.tour, shows } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (clientId) {
      upsertShow(newShow, clientId).catch(console.error)
      pushToGoogleCalendar(clientId, 'show', newShow)
    }
  },

  importShows: async (shows) => {
    const { clientId } = get()
    if (!clientId || shows.length === 0) return { saved: 0, failed: 0 }
    const updated = {
      clients: get().data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, tour: { ...c.tour, shows: [...c.tour.shows, ...shows].sort((a, b) => a.date.localeCompare(b.date)) } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    // Saved a few at a time so a long calendar doesn't open dozens of connections at once.
    let failed = 0
    for (let i = 0; i < shows.length; i += 8) {
      const results = await Promise.allSettled(shows.slice(i, i + 8).map(s => upsertShow(s, clientId)))
      failed += results.filter(r => r.status === 'rejected').length
    }
    shows.forEach(s => pushToGoogleCalendar(clientId, 'show', s))
    return { saved: shows.length - failed, failed }
  },

  updateShowStatus: (showId, status) => {
    const { data, clientId } = get()
    let updatedShow: Show | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          tour: {
            ...c.tour,
            shows: c.tour.shows.map(s => {
              if (s.id !== showId) return s
              updatedShow = { ...s, status }
              return updatedShow
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    // Status isn't part of the pushed event body (title/date/time only),
    // so nothing Google-visible would change — no push here.
    if (clientId && updatedShow) upsertShow(updatedShow, clientId).catch(console.error)
  },

  // Guarantee/deposit/currency don't appear on the pushed Google event
  // either, for the same reason — no push here.
  updateShowFinancials: (showId, patch) => {
    const { data, clientId } = get()
    let updatedShow: Show | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          tour: {
            ...c.tour,
            shows: c.tour.shows.map(s => {
              if (s.id !== showId) return s
              updatedShow = { ...s, ...patch }
              return updatedShow
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (clientId && updatedShow) upsertShow(updatedShow, clientId).catch(console.error)
  },

  generateInvoiceFromShow: (showId) => {
    const { data, clientId, workspaceId } = get()
    const client = data.clients.find(c => c.id === clientId)
    const show = client?.tour.shows.find(s => s.id === showId)
    if (!client || !show || !show.guarantee || show.invoiceId) return

    const agencyPct = show.viaAgency ? (show.agencyCommissionPct ?? 0) : 0
    const mgmtPct = show.viaAgency ? (show.managementCommissionPct ?? 0) : 0
    const net = show.guarantee * (1 - agencyPct / 100 - mgmtPct / 100)

    const linkedOffer = show.tourOfferId ? client.agentData?.offers.find(o => o.id === show.tourOfferId) : undefined
    const to = show.viaAgency && show.agencyName ? show.agencyName : (linkedOffer?.promoter ?? show.venue)

    const dueDate = addDays(show.date, 30)

    const invoice: Invoice = {
      id: 'inv-' + uid(),
      number: 'INV-' + Date.now().toString().slice(-6),
      to, category: 'touring', status: 'draft',
      issuedDate: localToday(),
      dueDate,
      items: [{ description: `Guarantee — ${show.venue}, ${show.city} (${show.date})`, quantity: 1, rate: net }],
      currency: show.currency ?? 'USD',
    }
    const updatedShow: Show = { ...show, invoiceId: invoice.id }

    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          finance: { ...c.finance, invoices: [...(c.finance?.invoices ?? []), invoice] },
          tour: { ...c.tour, shows: c.tour.shows.map(s => s.id === showId ? updatedShow : s) },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) {
      // shows.invoice_id has a real foreign key to invoices — the invoice
      // must land in the DB first, same ordering fix already used for the
      // offer→show write.
      upsertInvoice(invoice, clientId)
        .then(() => upsertShow(updatedShow, clientId))
        .catch(console.error)
    }
  },

  deleteShow: (showId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, tour: { ...c.tour, shows: c.tour.shows.filter(s => s.id !== showId) } }
      }),
    }
    set({ data: updated, selectedShowId: null })
    saveData(updated)
    dbDeleteShow(showId).catch(console.error)
    if (clientId) pushDeleteToGoogleCalendar(clientId, 'show', showId)
  },

  // ── Tour offers ──
  addOffer: (patch) => {
    const { data, clientId, workspaceId } = get()
    const newOffer: TourOffer = { id: 'offer-' + uid(), status: 'inquiry', ...patch }
    // A budget is drafted the moment an offer comes in (crew who tour with the
    // artist and their saved rates are already in it).
    const client = data.clients.find(c => c.id === clientId)
    const newBudget: Budget | undefined = client
      ? { id: 'bud-' + uid(), updatedAt: new Date().toISOString(), ...buildNewBudget({ client, offer: newOffer }) }
      : undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.agentData) return c
        return {
          ...c,
          agentData: { ...c.agentData, offers: [...c.agentData.offers, newOffer] },
          finance: newBudget ? { ...c.finance, budgets: [...(c.finance.budgets ?? []), newBudget] } : c.finance,
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) {
      // budgets.offer_id is a foreign key to the offer, so the offer goes first.
      upsertOffer(newOffer, clientId)
        .then(() => { if (newBudget) return upsertBudget(newBudget, clientId) })
        .catch(console.error)
    }
  },

  updateOffer: (offerId, patch) => {
    const { data, clientId, workspaceId } = get()
    let updatedOffer: TourOffer | undefined
    let newShow: Show | undefined
    let lockedBudget: Budget | undefined
    let newAdvance: ShowAdvance | undefined
    let withdrewSheets = false
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.agentData) return c
        const offers = c.agentData.offers.map(o => {
          if (o.id !== offerId) return o
          updatedOffer = { ...o, ...patch }
          // Confirming an offer creates its Show automatically — only on the
          // transition into 'confirmed', not on every edit while confirmed.
          if (patch.status === 'confirmed' && o.status !== 'confirmed' && !updatedOffer.showId) {
            newShow = {
              id: 'show-' + uid(), date: updatedOffer.date, city: updatedOffer.city,
              venue: updatedOffer.venue, time: '20:00', status: 'confirmed',
              guarantee: updatedOffer.guarantee, currency: 'USD', tourOfferId: updatedOffer.id,
              viaAgency: updatedOffer.viaAgency, agencyName: updatedOffer.agencyName,
              agencyCommissionPct: updatedOffer.agencyCommissionPct,
              managementCommissionPct: updatedOffer.managementCommissionPct,
            }
            updatedOffer = { ...updatedOffer, showId: newShow.id }
            // ...and starts its advance, with what the offer already says filled in.
            const t = updatedOffer.terms
            newAdvance = {
              id: 'adv-' + uid(), showId: newShow.id, status: 'draft',
              schedule: { ...(t?.doors ? { doorsOpen: t.doors } : {}), ...(t?.setStart ? { headlineOn: t.setStart } : {}) },
              production: t?.production ? { notes: t.production } : {},
              hospitality: t?.hospitality ? { notes: t.hospitality } : {},
              logistics: {}, contacts: [],
            }
          }
          return updatedOffer
        })
        // Confirming the offer locks the budget's Original: from here on edits only
        // change "Current", so Original vs Current vs Actual stays meaningful.
        const finance = newShow
          ? {
              ...c.finance,
              budgets: (c.finance.budgets ?? []).map(b => {
                if (b.offerId !== offerId || b.status !== 'draft') return b
                const now = new Date().toISOString()
                lockedBudget = { ...b, showId: newShow!.id, status: 'locked', original: snapshotOf(b), lockedAt: now, updatedAt: now }
                return lockedBudget
              }),
            }
          : c.finance
        let tour = newShow
          ? {
              ...c.tour,
              shows: [...c.tour.shows, newShow].sort((a, b) => a.date.localeCompare(b.date)),
              advances: newAdvance ? [...(c.tour.advances ?? []), newAdvance] : c.tour.advances,
            }
          : c.tour
        // A cancelled offer shouldn't keep asking the artist for an answer.
        if (patch.status === 'cancelled' && (tour.offerSheets ?? []).some(sh => sh.offerId === offerId && sh.status === 'sent')) {
          tour = { ...tour, offerSheets: (tour.offerSheets ?? []).map(sh => sh.offerId === offerId && sh.status === 'sent' ? { ...sh, status: 'withdrawn' as const } : sh) }
          withdrewSheets = true
        }
        return { ...c, agentData: { ...c.agentData, offers }, finance, tour }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && withdrewSheets) withdrawOfferSheets(offerId).catch(console.error)
    if (clientId && newShow) {
      // The offer's row references the new show's id via a foreign key, so
      // the show must land in the DB first — write them in sequence, not
      // fire-and-forget in parallel, or the offer write can lose the race
      // and get rejected for pointing at a show that doesn't exist yet.
      upsertShow(newShow, clientId)
        .then(() => { if (workspaceId && updatedOffer) return upsertOffer(updatedOffer, clientId) })
        .then(() => { if (workspaceId && lockedBudget) return upsertBudget(lockedBudget, clientId) })
        .then(() => { if (workspaceId && newAdvance) return upsertAdvance(newAdvance) })
        .catch(console.error)
      pushToGoogleCalendar(clientId, 'show', newShow)
      const showId = newShow.id
      notify(
        `${newShow.venue} is confirmed: added to the calendar, ${lockedBudget ? 'budget locked, ' : ''}advance started.`,
        { label: 'Open show', run: () => { const st = get(); st.setSection('tour'); st.setTourSub('tour'); st.setSelectedShow(showId) } },
      )
    } else if (workspaceId && clientId && updatedOffer) {
      upsertOffer(updatedOffer, clientId).catch(console.error)
    }
  },

  deleteOffer: (offerId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.agentData) return c
        return {
          ...c,
          agentData: { ...c.agentData, offers: c.agentData.offers.filter(o => o.id !== offerId) },
          tour: { ...c.tour, offerSheets: (c.tour.offerSheets ?? []).filter(sh => sh.offerId !== offerId) },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteOffer(offerId).catch(console.error)
  },

  sendOfferSheet: async (offerId, { detail, message }) => {
    const { data, clientId, workspaceId } = get()
    const client = data.clients.find(c => c.id === clientId)
    const offer = client?.agentData?.offers.find(o => o.id === offerId)
    const budget = client?.finance.budgets?.find(b => b.offerId === offerId)
    if (!client || !clientId || !offer) return { ok: false, error: 'Could not find that offer.' }
    if (!budget) return { ok: false, error: 'This offer has no budget yet - open its budget first.' }

    const existing = client.tour.offerSheets ?? []
    const version = existing.filter(sh => sh.offerId === offerId).reduce((m, sh) => Math.max(m, sh.version), 0) + 1
    const sheet: OfferSheet = {
      id: 'osh-' + uid(), offerId, version, status: 'sent', detail,
      message: message?.trim() || undefined,
      snapshot: buildOfferSheetSnapshot({ client, offer, budget, detail }),
      sentAt: new Date().toISOString(),
    }

    // The artist is being asked a question, so wait until it is really saved before saying "sent".
    if (workspaceId) {
      try { await insertOfferSheet(sheet, clientId) }
      catch (e) { console.error(e); return { ok: false, error: 'Could not send the sheet - nothing was sent. Please try again.' } }
    }

    const updated = {
      clients: get().data.clients.map(c => {
        if (c.id !== clientId) return c
        const sheets = (c.tour.offerSheets ?? []).map(sh =>
          sh.offerId === offerId && (sh.status === 'sent' || sh.status === 'approved' || sh.status === 'passed')
            ? { ...sh, status: 'superseded' as const } : sh)
        return { ...c, tour: { ...c.tour, offerSheets: [...sheets, sheet] } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    return { ok: true, sheetId: sheet.id }
  },

  answerOfferSheet: async (sheetId, response, note) => {
    const { clientId, workspaceId } = get()
    if (!clientId) return { ok: false, error: 'Something went wrong - please reload the page.' }
    let answered: OfferSheet | undefined
    if (workspaceId) {
      try { answered = await dbAnswerOfferSheet(sheetId, response, note) }
      catch (e) {
        console.error(e)
        const msg = e instanceof Error ? e.message : (e as { message?: string })?.message
        return { ok: false, error: msg?.includes('already answered') ? msg : 'Your answer could not be saved - please try again.' }
      }
    }
    const updated = {
      clients: get().data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          tour: {
            ...c.tour,
            offerSheets: (c.tour.offerSheets ?? []).map(sh => sh.id !== sheetId ? sh : (answered ?? {
              ...sh, status: response, respondedAt: new Date().toISOString(), responseNote: note?.trim() || undefined,
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    return { ok: true }
  },

  // ── Runs, budgets, crew pay (Stage 4) ──
  addRun: (name) => {
    const { data, clientId, workspaceId } = get()
    const run: Run = { id: 'run-' + uid(), name: name.trim() || 'New run' }
    const updated = { clients: data.clients.map(c => c.id !== clientId ? c : { ...c, tour: { ...c.tour, runs: [...(c.tour.runs ?? []), run] } }) }
    set({ data: updated }); saveData(updated)
    if (workspaceId && clientId) upsertRun(run, clientId).catch(console.error)
    return run.id
  },

  renameRun: (runId, name) => {
    const { data, clientId, workspaceId } = get()
    let renamed: Run | undefined
    const updated = { clients: data.clients.map(c => c.id !== clientId ? c : { ...c, tour: { ...c.tour, runs: (c.tour.runs ?? []).map(r => r.id !== runId ? r : (renamed = { ...r, name: name.trim() || r.name })) } }) }
    set({ data: updated }); saveData(updated)
    if (workspaceId && clientId && renamed) upsertRun(renamed, clientId).catch(console.error)
  },

  deleteRun: (runId) => {
    const { data, clientId } = get()
    // The database un-groups the run's shows (and clears whole-run cost links); mirror that here.
    const updated = {
      clients: data.clients.map(c => c.id !== clientId ? c : {
        ...c,
        tour: {
          ...c.tour,
          runs: (c.tour.runs ?? []).filter(r => r.id !== runId),
          shows: c.tour.shows.map(sh => sh.runId === runId ? { ...sh, runId: undefined } : sh),
          travel: c.tour.travel.map(t => t.runId === runId ? { ...t, runId: undefined } : t),
        },
        finance: { ...c.finance, expenses: c.finance.expenses.map(e => e.runId === runId ? { ...e, runId: undefined } : e) },
      }),
    }
    set({ data: updated }); saveData(updated)
    dbDeleteRun(runId).catch(console.error)
  },

  setShowRun: (showId, runId) => {
    const { data, clientId, workspaceId } = get()
    let changed: Show | undefined
    const updated = {
      clients: data.clients.map(c => c.id !== clientId ? c : {
        ...c,
        tour: { ...c.tour, shows: c.tour.shows.map(sh => sh.id !== showId ? sh : (changed = { ...sh, runId: runId ?? undefined })) },
      }),
    }
    set({ data: updated }); saveData(updated)
    if (workspaceId && clientId && changed) upsertShow(changed, clientId).catch(console.error)
  },

  setCrewRate: (rate) => {
    const { data, clientId, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        const rates = c.finance.crewRates ?? []
        const next = rates.some(r => r.crewMemberId === rate.crewMemberId)
          ? rates.map(r => r.crewMemberId === rate.crewMemberId ? rate : r)
          : [...rates, rate]
        return { ...c, finance: { ...c.finance, crewRates: next } }
      }),
    }
    set({ data: updated }); saveData(updated)
    if (workspaceId && clientId) upsertCrewRate(rate, clientId).catch(console.error)
  },

  setFinanceSettings: (settings) => {
    const { data, clientId, workspaceId } = get()
    const updated = { clients: data.clients.map(c => c.id !== clientId ? c : { ...c, finance: { ...c.finance, settings } }) }
    set({ data: updated }); saveData(updated)
    if (workspaceId && clientId) upsertFinanceSettings(settings, clientId).catch(console.error)
  },

  addBudget: ({ showId, offerId }) => {
    const { data, clientId, workspaceId } = get()
    const client = data.clients.find(c => c.id === clientId)
    if (!client) return null
    const offer = client.agentData.offers.find(o => (offerId ? o.id === offerId : o.showId === showId))
    const show = client.tour.shows.find(sh => sh.id === (showId ?? offer?.showId))
    if (!offer && !show) return null
    // One budget per offer/show: reuse it if it's already there.
    const existing = (client.finance.budgets ?? []).find(b => (offer && b.offerId === offer.id) || (show && b.showId === show.id))
    if (existing) return existing.id
    const budget: Budget = { id: 'bud-' + uid(), updatedAt: new Date().toISOString(), ...buildNewBudget({ client, show, offer }) }
    const updated = { clients: data.clients.map(c => c.id !== clientId ? c : { ...c, finance: { ...c.finance, budgets: [...(c.finance.budgets ?? []), budget] } }) }
    set({ data: updated }); saveData(updated)
    if (workspaceId && clientId) upsertBudget(budget, clientId).catch(console.error)
    return budget.id
  },

  updateBudget: (budgetId, patch) => {
    const { data, clientId, workspaceId } = get()
    let next: Budget | undefined
    const updated = {
      clients: data.clients.map(c => c.id !== clientId ? c : {
        ...c,
        finance: { ...c.finance, budgets: (c.finance.budgets ?? []).map(b => b.id !== budgetId ? b : (next = { ...b, ...patch, updatedAt: new Date().toISOString() })) },
      }),
    }
    set({ data: updated }); saveData(updated)
    if (workspaceId && clientId && next) upsertBudget(next, clientId).catch(console.error)
  },

  deleteBudget: (budgetId) => {
    const { data, clientId, selectedBudgetId } = get()
    const updated = { clients: data.clients.map(c => c.id !== clientId ? c : { ...c, finance: { ...c.finance, budgets: (c.finance.budgets ?? []).filter(b => b.id !== budgetId) } }) }
    set({ data: updated, selectedBudgetId: selectedBudgetId === budgetId ? null : selectedBudgetId }); saveData(updated)
    dbDeleteBudget(budgetId).catch(console.error)
  },

  setSelectedBudget: (id) => set({ selectedBudgetId: id }),

  loadFxRates: async () => {
    try {
      const res = await fetch('/api/fx')
      if (!res.ok) return
      const body = await res.json() as { rates?: FxRates }
      if (body.rates) set({ fxRates: body.rates })
    } catch (e) { console.error(e) }
  },

  markInboxDone: (key) => {
    const before = get().inboxState
    set({ inboxState: { ...before, [key]: { state: 'done' } } })
    saveInboxChoice(key, { state: 'done' }).catch(e => { console.error(e); set({ inboxState: before }) })
  },
  snoozeInboxItem: (key, untilIso) => {
    const before = get().inboxState
    set({ inboxState: { ...before, [key]: { state: 'snoozed', until: untilIso } } })
    saveInboxChoice(key, { state: 'snoozed', until: untilIso }).catch(e => { console.error(e); set({ inboxState: before }) })
  },
  restoreInboxItem: (key) => {
    const before = get().inboxState
    const { [key]: _removed, ...rest } = before
    void _removed
    set({ inboxState: rest })
    clearInboxChoice(key).catch(e => { console.error(e); set({ inboxState: before }) })
  },

  // ── Agenda ──
  addAgendaPoints: (clientId, itemType, itemId, texts) => {
    const client = get().data.clients.find(c => c.id === clientId)
    if (!client || !get().data.clients.length) return
    const existing = pointsFor(client, itemType, itemId)
    const room = Math.max(0, MAX_AGENDA_POINTS - existing.length)
    if (texts.length > room) notify(room === 0 ? 'This agenda is full (60 points).' : `Only room for ${room} more point${room === 1 ? '' : 's'} here, so the rest were left out.`)
    const start = nextPosition(existing)
    const added: AgendaPoint[] = texts.filter(Boolean).slice(0, room).map((text, i) => ({
      id: 'ap-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : uid() + uid() + uid()),
      itemType, itemId, text, done: false, position: start + i,
    }))
    if (added.length === 0) return
    set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, agenda: [...(c.agenda ?? []), ...added] } : c) } })
    if (!get().workspaceId) return
    Promise.all(added.map(p => upsertAgendaPoint(p, clientId))).catch(e => {
      console.error(e)
      const ids = new Set(added.map(p => p.id))
      set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, agenda: (c.agenda ?? []).filter(p => !ids.has(p.id)) } : c) } })
      notify("Couldn't save that agenda point. You may not have access to change this agenda.")
    })
  },

  toggleAgendaPoint: (clientId, pointId) => {
    const before = get().data.clients.find(c => c.id === clientId)?.agenda?.find(p => p.id === pointId)
    if (!before) return
    const put = (p: AgendaPoint) => set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, agenda: (c.agenda ?? []).map(x => x.id === p.id ? p : x) } : c) } })
    const after = { ...before, done: !before.done }
    put(after)
    if (!get().workspaceId) return
    upsertAgendaPoint(after, clientId).catch(e => { console.error(e); put(before); notify("Couldn't save that change.") })
  },

  removeAgendaPoint: (clientId, pointId) => {
    const before = get().data.clients.find(c => c.id === clientId)?.agenda?.find(p => p.id === pointId)
    if (!before) return
    set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, agenda: (c.agenda ?? []).filter(p => p.id !== pointId) } : c) } })
    if (!get().workspaceId) return
    deleteAgendaPointRow(pointId).catch(e => {
      console.error(e)
      set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, agenda: [...(c.agenda ?? []), before] } : c) } })
      notify("Couldn't remove that point.")
    })
  },

  agendaPointToTodo: (clientId, pointId) => {
    const client = get().data.clients.find(c => c.id === clientId)
    const point = client?.agenda?.find(p => p.id === pointId)
    if (!client || !point) return
    // A point on a project points at that project; a point on a to-do points at whatever that to-do points at.
    const parent = point.itemType === 'task' ? client.tasks?.find(t => t.id === point.itemId) : undefined
    const link = point.itemType === 'project' ? { type: 'project' as const, id: point.itemId } : parent?.link
    const id = get().addTask(clientId, { title: point.text, assigneeId: get().userId ?? undefined, link })
    if (id && !point.done) get().toggleAgendaPoint(clientId, pointId)
    if (id) notify('Made into a to-do', { label: 'Undo', run: () => { get().deleteTask(clientId, id); if (!point.done) get().toggleAgendaPoint(clientId, pointId) } })
  },

  // ── To-dos ──
  addTask: (clientId, patch) => {
    const { data, userId, workspaceId } = get()
    const title = patch.title.trim().slice(0, 300)
    if (!title || !data.clients.some(c => c.id === clientId)) return null
    const task: Task = {
      id: 'task-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : uid() + uid() + uid()),
      title, notes: patch.notes?.trim() || undefined, dueDate: patch.dueDate || undefined,
      assigneeId: patch.assigneeId || undefined, link: patch.link, source: patch.source ?? 'manual',
      createdBy: userId ?? undefined, createdAt: new Date().toISOString(),
    }
    const withTask = (list: Task[] | undefined) => [...(list ?? []), task]
    set({ data: { clients: data.clients.map(c => c.id === clientId ? { ...c, tasks: withTask(c.tasks) } : c) } })
    if (workspaceId) {
      upsertTask(task, clientId).catch(e => {
        console.error(e)
        set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, tasks: (c.tasks ?? []).filter(t => t.id !== task.id) } : c) } })
        notify("Couldn't save that to-do. You may not have access to add one for this artist.")
      })
    }
    return task.id
  },

  toggleTask: (clientId, taskId) => {
    const before = get().data.clients.find(c => c.id === clientId)?.tasks?.find(t => t.id === taskId)
    if (!before) return
    const after: Task = { ...before, doneAt: before.doneAt ? undefined : new Date().toISOString() }
    get().applyTask(clientId, after, before)
  },

  updateTask: (clientId, taskId, patch) => {
    const before = get().data.clients.find(c => c.id === clientId)?.tasks?.find(t => t.id === taskId)
    if (!before) return
    const after: Task = { ...before }
    if (patch.title !== undefined) after.title = patch.title.trim().slice(0, 300) || before.title
    if (patch.dueDate !== undefined) after.dueDate = patch.dueDate || undefined
    if (patch.assigneeId !== undefined) after.assigneeId = patch.assigneeId || undefined
    if (patch.notes !== undefined) after.notes = patch.notes?.trim() || undefined
    get().applyTask(clientId, after, before)
  },

  applyTask: (clientId, after, before) => {
    const put = (t: Task) => set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, tasks: (c.tasks ?? []).map(x => x.id === t.id ? t : x) } : c) } })
    put(after)
    if (!get().workspaceId) return
    upsertTask(after, clientId).catch(e => {
      console.error(e)
      put(before)
      notify("Couldn't save that change. You may not have access to change this to-do.")
    })
  },

  deleteTask: (clientId, taskId) => {
    const before = get().data.clients.find(c => c.id === clientId)?.tasks?.find(t => t.id === taskId)
    if (!before) return
    set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, tasks: (c.tasks ?? []).filter(t => t.id !== taskId) } : c) } })
    if (!get().workspaceId) return
    deleteTaskRow(taskId).catch(e => {
      console.error(e)
      set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, tasks: [...(c.tasks ?? []), before] } : c) } })
      notify("Couldn't remove that to-do. You may not have access to remove it.")
    })
  },

  confirmSettlement: async (draft, { showIds, filePath, fileName }) => {
    const { clientId, workspaceId } = get()
    const client = get().data.clients.find(c => c.id === clientId)
    if (!client || !clientId) return { ok: false, error: 'Something went wrong - please reload the page.' }
    if (showIds.length === 0) return { ok: false, error: 'Pick the show (or shows) this settlement is for.' }

    // Freeze the exchange rates as of right now, so settled figures never drift afterwards.
    await get().loadFxRates()
    const rates = get().fxRates
    const { showDates, ...rest } = draft
    void showDates
    const settlement: Settlement = {
      ...rest, id: 'stl-' + uid(), showIds, filePath, fileName,
      fx: { USD: 1, EUR: rates.EUR ?? 0, GBP: rates.GBP ?? 0, at: new Date().toISOString() },
      confirmedAt: new Date().toISOString(),
    }
    settlement.balanceDue = balanceOf(settlement)

    if (workspaceId) {
      try { await insertSettlement(settlement, clientId) }
      catch (e) { console.error(e); return { ok: false, error: 'Could not save the settlement - nothing was saved. Please try again.' } }
    }

    set({
      data: {
        clients: get().data.clients.map(c => c.id !== clientId ? c : {
          ...c, finance: { ...c.finance, settlements: [...(c.finance.settlements ?? []), settlement] },
        }),
      },
    })
    saveData(get().data)

    // Each linked offer is now settled (its net payout = this show's share, in USD); each budget
    // gets a line for any kind of income it didn't have yet (bonuses, production buyouts), at $0
    // Current so the real number shows up in Actual without changing the budget.
    const toUsd = makeConverter(frozenRates(settlement)).convert
    const sharePerShow = settlementEarned(settlement) / showIds.length
    const settledAt = settlement.preparedOn ?? localToday()
    for (const showId of showIds) {
      const show = client.tour.shows.find(s => s.id === showId)
      if (show?.tourOfferId) {
        get().updateOffer(show.tourOfferId, { status: 'settled', settledAt, netPayout: Math.round(toUsd(sharePerShow, settlement.currency, 'USD')) })
      }
      const budget = (get().data.clients.find(c => c.id === clientId)?.finance.budgets ?? []).find(b => b.showId === showId)
      if (budget) {
        const missing = new Set<BudgetBucket>()
        for (const l of settlement.payout) {
          const bucket = l.kind === 'bonus' ? 'bonus' : l.kind === 'buyout' ? 'buyout' : null
          if (bucket && l.amount !== 0 && !budget.lines.some(x => x.section === 'income' && x.bucket === bucket)) missing.add(bucket)
        }
        if (missing.size > 0) get().updateBudget(budget.id, { lines: [...budget.lines, ...[...missing].map(b => newLine(b, BUCKET_LABEL[b], 0))] })
      }
    }
    return { ok: true, settlementId: settlement.id }
  },

  addSettlementPayment: async (settlementId, payment) => {
    const { clientId, workspaceId } = get()
    const current = get().data.clients.find(c => c.id === clientId)?.finance.settlements?.find(x => x.id === settlementId)
    if (!clientId || !current) return { ok: false, error: 'Could not find that settlement.' }
    const payments = [...current.payments, payment]
    const updated: Settlement = { ...current, payments, balanceDue: balanceOf({ ...current, payments, balanceDue: undefined }) }
    if (workspaceId) {
      try { await updateSettlementPayments(updated) }
      catch (e) { console.error(e); return { ok: false, error: 'Could not save the payment - please try again.' } }
    }
    set({
      data: {
        clients: get().data.clients.map(c => c.id !== clientId ? c : {
          ...c, finance: { ...c.finance, settlements: (c.finance.settlements ?? []).map(x => x.id === settlementId ? updated : x) },
        }),
      },
    })
    saveData(get().data)
    return { ok: true }
  },

  deleteSettlement: async (settlementId) => {
    const { clientId, workspaceId } = get()
    const client = get().data.clients.find(c => c.id === clientId)
    const current = client?.finance.settlements?.find(x => x.id === settlementId)
    if (!client || !clientId || !current) return { ok: false, error: 'Could not find that settlement.' }
    if (workspaceId) {
      try { await deleteSettlementRow(settlementId) }
      catch (e) { console.error(e); return { ok: false, error: 'Could not delete the settlement - please try again.' } }
      if (current.filePath) {
        fetch('/api/settlements/file', {
          method: 'DELETE', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, path: current.filePath }),
        }).catch(console.error)
      }
    }
    set({
      data: {
        clients: get().data.clients.map(c => c.id !== clientId ? c : {
          ...c, finance: { ...c.finance, settlements: (c.finance.settlements ?? []).filter(x => x.id !== settlementId) },
        }),
      },
    })
    saveData(get().data)
    // The offers it settled go back to Confirmed.
    for (const showId of current.showIds) {
      const offerId = client.tour.shows.find(s => s.id === showId)?.tourOfferId
      const offer = offerId ? client.agentData.offers.find(o => o.id === offerId) : undefined
      if (offer?.status === 'settled') get().updateOffer(offer.id, { status: 'confirmed', settledAt: undefined, netPayout: undefined })
    }
    return { ok: true }
  },

  // ── Venue library ──
  saveProfile: async (patch) => {
    const { data, clientId, workspaceId } = get()
    const client = data.clients.find(c => c.id === clientId)
    if (!client || !clientId) return { ok: false, error: 'No artist is open' }
    const before = client.profile
    const next: ArtistProfile = { ...(before ?? {}), ...patch }
    const updated = { clients: data.clients.map(c => c.id === clientId ? { ...c, profile: next } : c) }
    set({ data: updated })
    saveData(updated)
    if (!workspaceId) return { ok: true }
    try {
      await upsertArtistProfile(clientId, next)
      return { ok: true }
    } catch (e) {
      console.error(e)
      // Put the screen back to what the database still has, so it never shows something that was not saved.
      set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, profile: before } : c) } })
      return { ok: false, error: "Couldn't save. Please try again." }
    }
  },

  saveAccounts: async (accounts) => {
    const { data, clientId, workspaceId } = get()
    const client = data.clients.find(c => c.id === clientId)
    if (!client || !clientId) return { ok: false, error: 'No artist is open' }
    const before = client.accounts
    const incoming = new Map(accounts.map(a => [a.id, a]))
    const next = [...(before ?? []).map(a => incoming.get(a.id) ?? a), ...accounts.filter(a => !(before ?? []).some(b => b.id === a.id))]
      .sort((a, b) => a.platform.localeCompare(b.platform))
    const updated = { clients: data.clients.map(c => c.id === clientId ? { ...c, accounts: next } : c) }
    set({ data: updated })
    saveData(updated)
    if (!workspaceId) return { ok: true }
    try {
      await upsertAccounts(clientId, accounts)
      return { ok: true }
    } catch (e) {
      console.error(e)
      set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, accounts: before } : c) } })
      return { ok: false, error: "Couldn't save. Please try again." }
    }
  },

  removeAccount: async (accountId) => {
    const { data, clientId, workspaceId } = get()
    const client = data.clients.find(c => c.id === clientId)
    if (!client || !clientId) return { ok: false, error: 'No artist is open' }
    const before = client.accounts
    const updated = { clients: data.clients.map(c => c.id === clientId ? { ...c, accounts: (before ?? []).filter(a => a.id !== accountId) } : c) }
    set({ data: updated })
    saveData(updated)
    if (!workspaceId) return { ok: true }
    try {
      await deleteAccountRow(accountId)
      return { ok: true }
    } catch (e) {
      console.error(e)
      set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, accounts: before } : c) } })
      return { ok: false, error: "Couldn't remove it. Please try again." }
    }
  },

  addVenue: (patch) => {
    const { data, clientId, workspaceId } = get()
    const newVenue: Venue = { id: 'venue-' + uid(), createdAt: new Date().toISOString(), ...patch }
    const updated = {
      clients: data.clients.map(c => c.id !== clientId ? c : { ...c, tour: { ...c.tour, venues: [...(c.tour.venues ?? []), newVenue] } }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) upsertVenue(newVenue, clientId).catch(console.error)
    return newVenue.id
  },

  updateVenue: (venueId, patch) => {
    const { data, clientId, workspaceId } = get()
    let updatedVenue: Venue | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          tour: {
            ...c.tour,
            venues: (c.tour.venues ?? []).map(v => {
              if (v.id !== venueId) return v
              const next = { ...v, ...patch }
              updatedVenue = next
              return next
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId && updatedVenue) upsertVenue(updatedVenue, clientId).catch(console.error)
  },

  deleteVenue: (venueId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, tour: { ...c.tour, venues: (c.tour.venues ?? []).filter(v => v.id !== venueId) } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteVenue(venueId).catch(console.error)
  },

  // ── Post actions ──
  addPost: (date, title, time, type) => {
    const { data, clientId } = get()
    const newPost: Post = { id: 'post-' + uid(), date, title, time, type: type as Post['type'] }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, content: { posts: [...c.content.posts, newPost] } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (clientId) {
      upsertPost(newPost, clientId).catch(console.error)
      pushToGoogleCalendar(clientId, 'post', newPost)
    }
  },

  updatePost: (postId, patch) => {
    const { data, clientId } = get()
    let updatedPost: Post | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          content: {
            posts: c.content.posts.map(p => {
              if (p.id !== postId) return p
              updatedPost = { ...p, date: patch.date, title: patch.title, time: patch.time, type: patch.type as Post['type'] }
              return updatedPost
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (clientId && updatedPost) {
      upsertPost(updatedPost, clientId).catch(console.error)
      pushToGoogleCalendar(clientId, 'post', updatedPost)
    }
  },

  deletePost: (postId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, content: { posts: c.content.posts.filter(p => p.id !== postId) } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeletePost(postId).catch(console.error)
    if (clientId) pushDeleteToGoogleCalendar(clientId, 'post', postId)
  },

  // ── Royalties ──
  addRoyaltyStream: (name, type, amount, currency, period) => {
    const { data, clientId, workspaceId } = get()
    const newStream = { id: 'roy-' + uid(), name, type, amount, currency, period }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          business: {
            ...c.business,
            royalties: { streams: [newStream, ...c.business.royalties.streams] },
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) upsertRoyaltyStream(newStream, clientId).catch(console.error)
  },

  deleteRoyaltyStream: (streamId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          business: {
            ...c.business,
            royalties: { streams: c.business.royalties.streams.filter(s => s.id !== streamId) },
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteRoyaltyStream(streamId).catch(console.error)
  },

  // ── Banking ──
  addDeposit: (name, date, amount, currency, mgmt, lawyer, taxes) => {
    const { data, clientId, workspaceId } = get()
    const newDeposit = {
      id: 'dep-' + uid(), name, date, amount, currency,
      mgmt, lawyer, taxes, done: false,
    }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          business: {
            ...c.business,
            banking: { ...c.business.banking, deposits: [newDeposit, ...c.business.banking.deposits] },
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) upsertDeposit(newDeposit, clientId).catch(console.error)
  },

  markDepositDone: (depositId) => {
    const { data, clientId } = get()
    let updatedDeposit: typeof data.clients[0]['business']['banking']['deposits'][0] | undefined
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          business: {
            ...c.business,
            banking: {
              ...c.business.banking,
              deposits: c.business.banking.deposits.map(d => {
                if (d.id !== depositId) return d
                updatedDeposit = { ...d, done: true }
                return updatedDeposit
              }),
            },
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (clientId && updatedDeposit) upsertDeposit(updatedDeposit, clientId).catch(console.error)
  },

  dismissDeposit: (depositId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          business: {
            ...c.business,
            banking: {
              ...c.business.banking,
              deposits: c.business.banking.deposits.filter(d => d.id !== depositId),
            },
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteDeposit(depositId).catch(console.error)
  },

  // ── Projects ──
  addProject: (title, type, assigneeId, dueDate, fromArtist = false) => {
    const { data, clientId } = get()
    const newProject: Project = {
      id: 'proj-' + uid(),
      title, type,
      status: fromArtist ? 'submitted' : 'in-progress',
      assigneeId, dueDate,
      createdAt: localToday(),
      fromArtist,
    }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, projects: [...(c.projects ?? []), newProject] }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (clientId) {
      upsertProject(newProject, clientId).catch(e => {
        console.error(e)
        set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, projects: (c.projects ?? []).filter(p => p.id !== newProject.id) } : c) } })
        notify("Couldn't save that project. You may not have access to add one for this artist.")
      })
      pushToGoogleCalendar(clientId, 'project', newProject)
    }
  },

  // Status/assignee changes below don't touch title/dueDate — the only
  // fields on the pushed Google event — so neither pushes.
  updateProjectStatus: (projectId, status) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, projects: (c.projects ?? []).map(p => p.id === projectId ? { ...p, status } : p) }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (clientId) {
      const client = updated.clients.find(c => c.id === clientId)
      const proj = client?.projects?.find(p => p.id === projectId)
      if (proj) upsertProject(proj, clientId).catch(console.error)
    }
  },

  assignProject: (projectId, assigneeId) => {
    // Works from anywhere (Today lists projects of every artist), so find whose project it is.
    const owner = get().data.clients.find(c => c.projects?.some(p => p.id === projectId))
    const before = owner?.projects?.find(p => p.id === projectId)
    if (!owner || !before) return
    const clientId = owner.id
    const put = (p: Project) => set({ data: { clients: get().data.clients.map(c => c.id === clientId ? { ...c, projects: (c.projects ?? []).map(x => x.id === p.id ? p : x) } : c) } })
    const after: Project = { ...before, assigneeId: assigneeId || undefined }
    put(after)
    saveData(get().data)
    upsertProject(after, clientId).catch(e => {
      console.error(e)
      put(before)
      notify("Couldn't give that project to them. They may not have access to this artist.")
    })
  },

  deleteProject: (projectId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, projects: (c.projects ?? []).filter(p => p.id !== projectId) }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteProject(projectId).catch(console.error)
    if (clientId) pushDeleteToGoogleCalendar(clientId, 'project', projectId)
  },

  // ── Artist Todos ──
  addArtistTodo: (title, dueDate) => {
    const { data, clientId } = get()
    const newTodo: ArtistTodo = {
      id: 'todo-' + uid(), title, done: false,
      dueDate, createdAt: localToday(),
    }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, artistTodos: [...(c.artistTodos ?? []), newTodo] }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (clientId) upsertArtistTodo(newTodo, clientId).catch(console.error)
  },

  toggleArtistTodo: (todoId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, artistTodos: (c.artistTodos ?? []).map(t => t.id === todoId ? { ...t, done: !t.done } : t) }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (clientId) {
      const client = updated.clients.find(c => c.id === clientId)
      const todo = client?.artistTodos?.find(t => t.id === todoId)
      if (todo) upsertArtistTodo(todo, clientId).catch(console.error)
    }
  },

  deleteArtistTodo: (todoId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, artistTodos: (c.artistTodos ?? []).filter(t => t.id !== todoId) }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteArtistTodo(todoId).catch(console.error)
  },

  // ── Legal templates (workspace-wide) ──
  addLegalTemplate: (name, description) => {
    const { legalTemplates, workspaceId } = get()
    const newTemplate: LegalTemplate = {
      id: 'tmpl-' + uid(),
      key: 'tmpl-' + uid(),
      name,
      description,
      clauses: [],
      updatedAt: localToday(),
    }
    const updated = [...legalTemplates, newTemplate]
    set({ legalTemplates: updated })
    saveLegalTemplatesLocal(updated)
    if (workspaceId) upsertLegalTemplate(newTemplate, workspaceId).catch(console.error)
  },

  updateLegalTemplate: (templateId, patch) => {
    const { legalTemplates, workspaceId } = get()
    let updatedTemplate: LegalTemplate | undefined
    const updated = legalTemplates.map(t => {
      if (t.id !== templateId) return t
      updatedTemplate = { ...t, ...patch, updatedAt: localToday() }
      return updatedTemplate
    })
    set({ legalTemplates: updated })
    saveLegalTemplatesLocal(updated)
    if (workspaceId && updatedTemplate) upsertLegalTemplate(updatedTemplate, workspaceId).catch(console.error)
  },

  deleteLegalTemplate: (templateId) => {
    const { legalTemplates } = get()
    const updated = legalTemplates.filter(t => t.id !== templateId)
    set({ legalTemplates: updated })
    saveLegalTemplatesLocal(updated)
    dbDeleteLegalTemplate(templateId).catch(console.error)
  },
}))
