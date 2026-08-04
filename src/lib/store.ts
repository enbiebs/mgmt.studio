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
  AppData, Client, Track, Show, Post,
  MainSection, SongsSub, ContentSub, BizSub, TourSub, Stage, AnalyticsSub,
  UserRole, ProjectStatus, ProjectType, Stakeholder, Project, ArtistTodo,
  TrackLabelCopy, ReleaseLabelCopy, ChecklistItemKey,
} from '@/types'
import { DEMO_DATA } from '@/lib/demo-data'
import { EMPTY_ANALYTICS } from '@/lib/analytics-demo'
import { EMPTY_FANDOM } from '@/lib/fandom-demo'
import { EMPTY_AGENT } from '@/lib/agent-demo'
import { EMPTY_LEGAL } from '@/lib/legal-demo'
import { EMPTY_FINANCE } from '@/lib/finance-demo'
import { EMPTY_TOUR } from '@/lib/advance-demo'
import { uid, defaultChecklist } from '@/lib/utils'
import {
  loadWorkspaceData, getMyWorkspaceId,
  upsertClient, deleteClient as dbDeleteClient,
  upsertTrack, deleteTrack as dbDeleteTrack,
  upsertShow, deleteShow as dbDeleteShow,
  upsertPost, deletePost as dbDeletePost,
  upsertDeposit, deleteDeposit as dbDeleteDeposit,
  upsertProject, deleteProject as dbDeleteProject,
  upsertArtistTodo, deleteArtistTodo as dbDeleteArtistTodo,
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

  // ── Auth / Supabase init ──
  initFromSupabase: (userId: string) => Promise<void>
  signOut: () => Promise<void>

  // ── Role ──
  setRole: (role: UserRole) => void

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
  updateTrackLabelCopy: (trackId: string, patch: TrackLabelCopy) => void
  updateAlbumLabelCopy: (albumId: string, patch: ReleaseLabelCopy) => void
  toggleChecklistItem: (albumId: string, key: ChecklistItemKey) => void
  updateChecklistNote: (albumId: string, key: ChecklistItemKey, note: string) => void

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

  // ── Supabase init ──
  initFromSupabase: async (userId) => {
    set({ isLoading: true, userId })
    try {
      const workspaceId = await getMyWorkspaceId()
      if (!workspaceId) {
        // New user with no workspace yet — workspace is created by DB trigger,
        // but may take a moment. Fall back to demo data.
        set({ isLoading: false })
        return
      }
      const appData = await loadWorkspaceData(workspaceId)
      // If workspace is empty, seed with demo data structure (no data, clean slate)
      set({
        workspaceId,
        isLoading: false,
        data: appData.clients.length > 0 ? appData : { clients: [] },
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
  setRole: (role) => set({ role }),

  // ── Navigation ──
  goToDashboard: () => set({ view: 'dashboard', clientId: null, selectedShowId: null }),
  openClient:    (id) => set({ view: 'studio', clientId: id, section: 'songs', selectedShowId: null }),
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
      songs:       { albums: [{ id: 'alb-' + uid(), title: name + ' (untitled)', tracks: [], checklist: defaultChecklist() }] },
      tour:        { ...EMPTY_TOUR },
      content:     { posts: [] },
      business: {
        royalties: { streams: [] },
        banking:   { deposits: [] },
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
    if (workspaceId) upsertClient(newClient, workspaceId).catch(console.error)
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

  updateTrackLabelCopy: (trackId, patch) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => ({
              ...a,
              tracks: a.tracks.map(t =>
                t.id !== trackId ? t : { ...t, labelCopy: { ...t.labelCopy, ...patch } }
              ),
            })),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
  },

  updateAlbumLabelCopy: (albumId, patch) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a =>
              a.id !== albumId ? a : { ...a, labelCopy: { ...a.labelCopy, ...patch } }
            ),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
  },

  toggleChecklistItem: (albumId, key) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => {
              if (a.id !== albumId) return a
              const items = a.checklist && a.checklist.length ? a.checklist : defaultChecklist()
              return { ...a, checklist: items.map(i => i.key === key ? { ...i, done: !i.done } : i) }
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
  },

  updateChecklistNote: (albumId, key, note) => {
    const { data, clientId } = get()
    const updated = {
      clients: data.clients.map(c => {
        if (c.id !== clientId) return c
        return {
          ...c,
          songs: {
            albums: c.songs.albums.map(a => {
              if (a.id !== albumId) return a
              const items = a.checklist && a.checklist.length ? a.checklist : defaultChecklist()
              return { ...a, checklist: items.map(i => i.key === key ? { ...i, note } : i) }
            }),
          },
        }
      }),
    }
    set({ data: updated })
    saveData(updated)
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
