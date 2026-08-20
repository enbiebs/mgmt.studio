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
  AppData, Client, Track, Show, Post, Album,
  MainSection, SongsSub, ContentSub, BizSub, TourSub, Stage, AnalyticsSub,
  UserRole, ProjectStatus, ProjectType, Stakeholder, Project, ArtistTodo,
  TrackLabelCopy, ReleaseLabelCopy, ChecklistItemKey, ChecklistItem, TrackPriority,
  GuestListEntry, GuestListCategory, ReleaseStakeholder, StakeholderRole,
  CrewMember, ShowAdvance, TravelItem, Person, PersonActivity, Currency,
  CatalogWork, RegStatus, Invoice, InvoiceLineItem, RevenueStream,
} from '@/types'
import { DEMO_DATA } from '@/lib/demo-data'
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
  upsertClient, deleteClient as dbDeleteClient,
  upsertTrack, deleteTrack as dbDeleteTrack,
  upsertAlbum, upsertChecklist,
  upsertPerson, deletePerson as dbDeletePerson,
  upsertStakeholder, deleteStakeholder as dbDeleteStakeholder,
  upsertShow, deleteShow as dbDeleteShow,
  upsertPost, deletePost as dbDeletePost, replaceAutoPosts,
  upsertDeposit, deleteDeposit as dbDeleteDeposit,
  upsertProject, deleteProject as dbDeleteProject,
  upsertArtistTodo, deleteArtistTodo as dbDeleteArtistTodo,
  upsertCrewMember, deleteCrewMember as dbDeleteCrewMember,
  upsertAdvance, deleteAdvance as dbDeleteAdvance,
  upsertGuestListEntry, deleteGuestListEntry as dbDeleteGuestListEntry,
  upsertTravelItem, deleteTravelItem as dbDeleteTravelItem,
  upsertCatalogWork, deleteCatalogWork as dbDeleteCatalogWork,
  linkBankTransaction,
  upsertInvoice,
} from '@/lib/db'

// ── Persistence helpers ─────────────────────────────────────
const STORAGE_KEY = 'studio-v1'

function loadData(): AppData {
  if (typeof window === 'undefined') return JSON.parse(JSON.stringify(DEMO_DATA))
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch { /* ignore */ }
  return JSON.parse(JSON.stringify(DEMO_DATA))
}

function saveData(data: AppData) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

// access_grants.section uses 'music' where the app's MainSection uses 'songs' —
// everything else lines up 1:1.
const SECTION_TO_GRANT_KEY: Record<MainSection, string> = {
  songs: 'music', tour: 'tour', content: 'content', business: 'business',
  team: 'team', projects: 'projects', analytics: 'analytics', fandom: 'fandom', legal: 'legal',
}
const ALL_SECTIONS: MainSection[] = ['songs', 'tour', 'content', 'business', 'team', 'projects', 'analytics', 'fandom', 'legal']

// ── State shape ─────────────────────────────────────────────
interface StudioState {
  // Data
  data: AppData

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
  selectedShowId: string | null
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
  setSelectedShow: (id: string | null) => void
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

  // ── Track actions ──
  addTrack: (albumId: string, title: string, stage: Stage) => void
  advanceTrack: (trackId: string) => void
  deleteTrack: (trackId: string) => void
  updateTrackDetails: (trackId: string, patch: { title?: string; notes?: string; priority?: TrackPriority; owner?: string; dueDate?: string; stage?: Stage }) => void
  updateTrackLabelCopy: (trackId: string, patch: TrackLabelCopy) => void
  updateAlbumLabelCopy: (albumId: string, patch: ReleaseLabelCopy) => void
  scheduleRelease: (albumId: string, releaseDate: string) => void
  toggleChecklistItem: (albumId: string, key: ChecklistItemKey) => void
  updateChecklistNote: (albumId: string, key: ChecklistItemKey, note: string) => void

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
  deleteCatalogWork: (workId: string) => void

  // ── Invoices ──
  addInvoice: (patch: { number: string; to: string; toEmail?: string; category: RevenueStream; currency: Currency; issuedDate: string; dueDate: string; items: InvoiceLineItem[]; notes?: string }) => void

  // ── Release stakeholders ──
  addStakeholder: (albumId: string, patch: { personId: string; role: StakeholderRole; notes?: string }) => void
  deleteStakeholder: (stakeholderId: string) => void

  // ── Guest list ──
  addGuest: (showId: string, name: string, qty: number, category: GuestListCategory, credential?: string, notes?: string) => void
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
  deleteShow: (showId: string) => void

  // ── Post actions ──
  addPost: (date: string, title: string, time: string, type: string) => void
  deletePost: (postId: string) => void

  // ── Banking ──
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
}

// ── Store ───────────────────────────────────────────────────
const now = new Date()

export const useStore = create<StudioState>((set, get) => ({
  data: loadData(),

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
  selectedShowId: null,
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
      const appData = await loadWorkspaceData(workspaceId)
      const hasClients = appData.clients.length > 0

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
  goToDashboard: () => set({ view: 'dashboard', clientId: null, selectedShowId: null }),
  openClient: (id) => {
    const s = get()
    const firstSection = (s.role === 'manager' || s.role === 'artist')
      ? 'songs'
      : (ALL_SECTIONS.find(sec => s.hasAccess(sec, id)) ?? 'songs')
    set({ view: 'studio', clientId: id, section: firstSection, selectedShowId: null })
  },
  setSection:    (section) => set({ section, selectedShowId: null }),
  setSongsSub:   (sub) => set({ songsSub: sub }),
  setContentSub: (sub) => set({ contentSub: sub }),
  setBizSub:       (sub) => set({ bizSub: sub }),
  setTourSub:      (sub) => set({ tourSub: sub }),
  setAnalyticsSub: (sub) => set({ analyticsSub: sub }),
  setSelectedShow: (id) => set({ selectedShowId: id }),
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
    if (workspaceId) upsertTravelItem(item).catch(console.error)
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

  // ── Banking ──
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
}))
