# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server at http://localhost:3000 (uses Turbopack)
npm run build     # Production build
npm run lint      # ESLint
npx tsc --noEmit  # TypeScript check (no test suite exists yet)
```

**Reset demo data:** If localStorage has a stale schema, clear it in the browser console:
```js
localStorage.removeItem('studio-v1'); location.reload();
```

**Environment (optional — app runs without it in demo mode):**
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```
When these are absent, the middleware and `AuthProvider` both short-circuit — the app runs fully off `localStorage` + demo data.

## Architecture

### Stack
- **Next.js 16** (App Router, Turbopack, `'use client'` components throughout)
- **Zustand** — single global store, no Context API
- **Tailwind CSS v4** — utility classes only, no external UI libs
- **Supabase** (`@supabase/ssr`) — optional; dual-write pattern when configured

### State: `src/lib/store.ts`

The entire app reads from and writes through `useStore`. All state mutations follow this pattern:
1. Update Zustand state immediately (optimistic)
2. Call `saveData()` to persist to `localStorage`
3. Fire-and-forget Supabase write via `.catch(console.error)`

The store holds two layers: **navigation state** (`view`, `clientId`, `section`, `tourSub`, etc.) and **data** (`data: AppData` — the full client roster). All view components read `getClient()` to get the currently-selected client.

### Navigation model

```
view === 'dashboard'  →  ClientCard grid
view === 'studio'     →  AppHeader + Subnav + section view

section:  songs | tour | content | business | projects | analytics | fandom
tourSub:  tour | advance | daysheet | travel | crew | guests
bizSub:   royalties | banking | catalog | pl | invoices | payments
contentSub: manage | studio | lab
```

`StudioApp.tsx` is the routing switch. Adding a new section means: (1) add its type to `TourSub`/`BizSub` etc. in `src/types/index.ts`, (2) add it to the `SUBNAV` map in `Subnav.tsx`, (3) add the render branch in `StudioApp.tsx`.

### Role system

`UserRole = 'manager' | 'artist' | 'agent' | 'lawyer'`

`StudioApp.tsx` renders completely different root components per role when `view === 'studio'`. The manager gets the full tabbed workspace; artist/agent/lawyer get their own dedicated views (`ArtistView`, `AgentView`, `LawyerView`). The role switcher lives in `AppHeader.tsx`.

### Data types: `src/types/index.ts`

All types live here. The shape of a `Client` is:
```ts
Client {
  songs: { albums: Album[] }          // tracks nested inside albums
  tour: TourData                       // shows, advances, crew, guestList, travel
  content: { posts: Post[] }
  business: { royalties, banking, catalog }
  projects: Project[]
  artistTodos: ArtistTodo[]
  analytics: AnalyticsData
  fandom: FanEngagement
  agentData: AgentData
  legal: LegalData
  finance: ClientFinance
}
```

`TourData` is the most complex nested type — it holds `ShowAdvance[]` (6-section advance with schedule/production/hospitality/logistics/contacts), `CrewMember[]`, `GuestListEntry[]`, and `TravelItem[]` (discriminated union of `TravelFlight | TravelHotel | TravelGround` via the `kind` field).

### Demo data

Each domain has its own demo file in `src/lib/`:
- `demo-data.ts` — root `DEMO_DATA` (3 clients: Mascolo, nimino, Sierra Bloom), imports tour data from `advance-demo.ts`
- `advance-demo.ts` — `MASCOLO_TOUR`, `NIMINO_TOUR`, `SIERRA_TOUR`, `EMPTY_TOUR`; also exports `MASCOLO_TRAVEL` with 12 booked/pending/needed travel items across 4 shows
- `analytics-demo.ts`, `fandom-demo.ts`, `agent-demo.ts`, `legal-demo.ts`, `finance-demo.ts` — per-domain empty shapes + Mascolo-specific demo data

`EMPTY_*` exports are used when `addClient()` initialises a fresh client.

### Supabase integration

`src/lib/supabase/client.ts` — `createBrowserClient` wrapper (client components)
`src/lib/supabase/server.ts` — `createServerClient` wrapper (middleware/server)
`src/lib/db.ts` — all Supabase reads/writes; `loadWorkspaceData()` hydrates the full `AppData` from ~15 tables in parallel on login
`src/middleware.ts` — auth guard; redirects unauthenticated users to `/login`; skips entirely if env vars are absent
`src/components/AuthProvider.tsx` — client-side session listener; calls `store.initFromSupabase(userId)` on login; skips entirely in demo mode
`supabase/migrations/001_initial_schema.sql` — full schema with RLS policies

### What's built vs. placeholder

**Built:** Songs, Tour (Shows, Advance, Day Sheet, Travel), Content (Manage, Studio), Business (Royalties, Banking, Catalog, P&L, Invoices, Payments), Projects, Analytics (7 panels), Fandom, Agent view, Lawyer view

**Placeholder (`StudioApp.tsx`):** Tour → Crew, Tour → Guests, Content → Lab

**Not yet wired to Supabase:** Tour advances, crew, guest list, travel items (these only persist to localStorage currently)
