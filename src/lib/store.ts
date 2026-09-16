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
  MainSection, SongsSub, ContentSub, BizSub, TourSub, Stage, AnalyticsSub, FandomSub, LegalSub,
  UserRole, ProjectStatus, ProjectType, Stakeholder, Project, ArtistTodo,
  TrackLabelCopy, ReleaseLabelCopy, ChecklistItemKey, ChecklistItem, TrackPriority,
  GuestListEntry, GuestListCategory, ReleaseStakeholder, StakeholderRole,
  CrewMember, ShowAdvance, TravelItem, Person, PersonActivity, Currency,
  CatalogWork, RegStatus, Invoice, InvoiceLineItem, InvoiceStatus, RevenueStream,
  LegalTemplate, LegalTemplateClause, TrackRound, TrackNote, TrackNoteReply, TrackCredit,
  ReleaseType, Venue, TourOffer, Expense, ExpenseCategory,
} from '@/types'
import { DEMO_DATA } from '@/lib/demo-data'
import { DEFAULT_LEGAL_TEMPLATES } from '@/lib/legal-templates-demo'
import { EMPTY_ANALYTICS } from '@/lib/analytics-demo'
import { EMPTY_FANDOM } from '@/lib/fandom-demo'
import { EMPTY_AGENT } from '@/lib/agent-demo'
import { EMPTY_LEGAL } from '@/lib/legal-demo'
import { EMPTY_FINANCE } from '@/lib/finance-demo'
import { EMPTY_TOUR } from '@/lib/advance-demo'
import { uid, defaultChecklist, addDays, ROLLOUT_TEMPLATE } from '@/lib/utils'
import {
  loadWorkspaceData, getMyMembership, getGrantsForMember, getPreviewableMembers,
  type AccessGrant, type PreviewMember,
  upsertClient, deleteClient as dbDeleteClient, setCalendarToken,
  upsertTrack, deleteTrack as dbDeleteTrack,
  upsertAlbum, deleteAlbum as dbDeleteAlbum, upsertChecklist,
  upsertPerson, deletePerson as dbDeletePerson,
  upsertStakeholder, deleteStakeholder as dbDeleteStakeholder,
  upsertShow, deleteShow as dbDeleteShow,
  upsertOffer, deleteOffer as dbDeleteOffer,
  upsertExpense, deleteExpense as dbDeleteExpense,
  upsertVenue, deleteVenue as dbDeleteVenue,
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

function saveData(data: AppData) {
  if (typeof window === 'undefined') return
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
  if (typeof window === 'undefined') return
  localStorage.setItem(LEGAL_TEMPLATES_KEY, JSON.stringify(templates))
}

// access_grants.section uses 'music' where the app's MainSection uses 'songs' —
// everything else lines up 1:1. 'calendar' has no grant of its own (see
// hasAccess) — it's a read-only aggregate view gated per-event by the
// underlying section's own access, not a section anyone can be granted.
const SECTION_TO_GRANT_KEY: Record<MainSection, string> = {
  calendar: 'calendar', songs: 'music', tour: 'tour', content: 'content', finance: 'finance',
  team: 'team', projects: 'projects', analytics: 'analytics', fandom: 'fandom', legal: 'legal',
}
const ALL_SECTIONS: MainSection[] = ['songs', 'tour', 'content', 'finance', 'team', 'projects', 'analytics', 'fandom', 'legal']

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

  // Navigation
  view: 'dashboard' | 'studio'
  clientId: string | null
  section: MainSection
  songsSub: SongsSub
  contentSub: ContentSub
  bizSub: BizSub
  tourSub: TourSub
  analyticsSub: AnalyticsSub
  fandomSub: FandomSub
  legalSub: LegalSub
  selectedShowId: string | null
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
  setFandomSub: (sub: FandomSub) => void
  setLegalSub: (sub: LegalSub) => void
  setSelectedShow: (id: string | null) => void
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
  saveCrewMember: (member: CrewMember) => void
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
  updateShowStatus: (showId: string, status: ShowStatus) => void
  updateShowFinancials: (showId: string, patch: { guarantee?: number; deposit?: number; currency?: Currency }) => void
  deleteShow: (showId: string) => void

  // ── Tour offers ──
  addOffer: (patch: { venue: string; city: string; country: string; date: string; promoter: string; guarantee: number; door?: number; buyout?: number; notes?: string }) => void
  /** Editing an offer's status into 'confirmed' also creates the matching Show. */
  updateOffer: (offerId: string, patch: Partial<Omit<TourOffer, 'id'>>) => void
  deleteOffer: (offerId: string) => void

  // ── Expenses ──
  addExpense: (patch: { description: string; vendor: string; amount: number; currency: Currency; category: ExpenseCategory; date: string; paid: boolean }) => void
  updateExpense: (expenseId: string, patch: Partial<Omit<Expense, 'id'>>) => void
  deleteExpense: (expenseId: string) => void

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
  addProject: (title: string, type: ProjectType, assignee?: Stakeholder, dueDate?: string, fromArtist?: boolean) => void
  updateProjectStatus: (projectId: string, status: ProjectStatus) => void
  assignProject: (projectId: string, assignee: Stakeholder) => void
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

  view:          'dashboard',
  clientId:      null,
  section:       'songs',
  songsSub:      'tracks',
  contentSub:    'manage',
  bizSub:        'royalties',
  tourSub:       'tour',
  analyticsSub:  'overview',
  fandomSub:     'overview',
  legalSub:      'pipeline',
  selectedShowId: null,
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
    if (s.role === 'manager') return true
    if (s.role === 'artist') {
      if (s.authClientId !== cid) return false
      return requireEdit ? section === 'projects' : true
    }
    const key = SECTION_TO_GRANT_KEY[section]
    return s.grants.some(g =>
      g.section === key && (g.clientId === null || g.clientId === cid) && (!requireEdit || g.canEdit)
    )
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
      if (role === 'agent' || role === 'lawyer' || role === 'team') {
        grants = await getGrantsForMember(memberId)
      } else if (role === 'manager') {
        previewMembers = await getPreviewableMembers(workspaceId)
      }

      set({
        workspaceId,
        isLoading: false,
        role,
        authRole: role,
        authClientId: memberClientId,
        grants,
        previewMembers,
        data: hasClients ? appData : { clients: [] },
        legalTemplates,
        // Artists land straight in their own client — no roster to pick from.
        ...(role === 'artist' && memberClientId
          ? { view: 'studio' as const, clientId: memberClientId }
          : {}),
      })
      // Clear localStorage since we now use Supabase
      if (typeof window !== 'undefined') localStorage.removeItem('studio-v1')
    } catch (err) {
      console.error('Failed to load from Supabase:', err)
      set({ isLoading: false })
    }
  },

  signOut: async () => {
    const { createClient } = await import('@/lib/supabase/client')
    await createClient().auth.signOut()
    window.location.href = '/login'
  },

  // ── Role ──
  previewAs: async (memberId) => {
    if (memberId === null) {
      set({ role: 'manager', grants: [], authClientId: null, previewMemberId: null, view: 'dashboard', clientId: null, section: 'songs' })
      return
    }
    const member = get().previewMembers.find(m => m.id === memberId)
    if (!member) return
    const grants = member.role === 'artist' ? [] : await getGrantsForMember(member.id)
    set({
      role: member.role,
      grants,
      authClientId: member.clientId,
      previewMemberId: memberId,
      view: member.role === 'artist' ? 'studio' : 'dashboard',
      clientId: member.role === 'artist' ? member.clientId : null,
      section: 'songs',
    })
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
  setFandomSub:    (sub) => set({ fandomSub: sub }),
  setLegalSub:     (sub) => set({ legalSub: sub }),
  setSelectedShow: (id) => set({ selectedShowId: id }),
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
      fandom:      EMPTY_FANDOM,
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
  saveCrewMember: (member) => {
    const { data, clientId, workspaceId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        const crew = c.tour.crew ?? []
        const exists = crew.some(m => m.id === member.id)
        return {
          ...c,
          tour: {
            ...c.tour,
            crew: exists ? crew.map(m => m.id === member.id ? member : m) : [...crew, member],
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) upsertCrewMember(member, clientId).catch(console.error)
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
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.finance) return c
        return { ...c, finance: { ...c.finance, expenses: c.finance.expenses.filter(e => e.id !== expenseId) } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteExpense(expenseId).catch(console.error)
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
    if (clientId) upsertShow(newShow, clientId).catch(console.error)
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
    if (clientId && updatedShow) upsertShow(updatedShow, clientId).catch(console.error)
  },

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
  },

  // ── Tour offers ──
  addOffer: (patch) => {
    const { data, clientId, workspaceId } = get()
    const newOffer: TourOffer = { id: 'offer-' + uid(), status: 'inquiry', ...patch }
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.agentData) return c
        return { ...c, agentData: { ...c.agentData, offers: [...c.agentData.offers, newOffer] } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (workspaceId && clientId) upsertOffer(newOffer, clientId).catch(console.error)
  },

  updateOffer: (offerId, patch) => {
    const { data, clientId, workspaceId } = get()
    let updatedOffer: TourOffer | undefined
    let newShow: Show | undefined
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
            }
            updatedOffer = { ...updatedOffer, showId: newShow.id }
          }
          return updatedOffer
        })
        return {
          ...c,
          agentData: { ...c.agentData, offers },
          tour: newShow
            ? { ...c.tour, shows: [...c.tour.shows, newShow].sort((a, b) => a.date.localeCompare(b.date)) }
            : c.tour,
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
    if (clientId && newShow) {
      // The offer's row references the new show's id via a foreign key, so
      // the show must land in the DB first — write them in sequence, not
      // fire-and-forget in parallel, or the offer write can lose the race
      // and get rejected for pointing at a show that doesn't exist yet.
      upsertShow(newShow, clientId)
        .then(() => { if (workspaceId && updatedOffer) return upsertOffer(updatedOffer, clientId) })
        .catch(console.error)
    } else if (workspaceId && clientId && updatedOffer) {
      upsertOffer(updatedOffer, clientId).catch(console.error)
    }
  },

  deleteOffer: (offerId) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId || !c.agentData) return c
        return { ...c, agentData: { ...c.agentData, offers: c.agentData.offers.filter(o => o.id !== offerId) } }
      }),
    }
    set({ data: updated })
    saveData(updated)
    dbDeleteOffer(offerId).catch(console.error)
  },

  // ── Venue library ──
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
    if (clientId) upsertPost(newPost, clientId).catch(console.error)
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
    if (clientId && updatedPost) upsertPost(updatedPost, clientId).catch(console.error)
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
  addProject: (title, type, assignee, dueDate, fromArtist = false) => {
    const { data, clientId } = get()
    const newProject: Project = {
      id: 'proj-' + uid(),
      title, type,
      status: fromArtist ? 'submitted' : 'in-progress',
      assignee, dueDate,
      createdAt: new Date().toISOString().slice(0, 10),
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
    if (clientId) upsertProject(newProject, clientId).catch(console.error)
  },

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

  assignProject: (projectId, assignee) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return { ...c, projects: (c.projects ?? []).map(p => p.id === projectId ? { ...p, assignee } : p) }
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
  },

  // ── Artist Todos ──
  addArtistTodo: (title, dueDate) => {
    const { data, clientId } = get()
    const newTodo: ArtistTodo = {
      id: 'todo-' + uid(), title, done: false,
      dueDate, createdAt: new Date().toISOString().slice(0, 10),
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
      updatedAt: new Date().toISOString().slice(0, 10),
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
      updatedTemplate = { ...t, ...patch, updatedAt: new Date().toISOString().slice(0, 10) }
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
