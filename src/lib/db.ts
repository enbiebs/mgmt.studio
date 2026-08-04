// ──────────────────────────────────────────────────────────
//  Studio · Database Helpers (Supabase)
//
//  loadWorkspaceData()  — hydrates the full AppData from all tables
//  Per-entity upsert/delete helpers used by the store actions
//
//  All functions are async and safe to call from client components.
// ──────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/client'
import type {
  AppData, Client, Track, Show, Post, Album,
  Project, ArtistTodo, TourOffer, Contract,
  Invoice, Expense, PLMonth, ChecklistItem, ReleaseStakeholder, UserRole,
  ShowAdvance, AdvanceContact, AdvanceSchedule, AdvanceProduction,
  AdvanceHospitality, AdvanceLogistics,
  CrewMember, GuestListEntry, TravelItem, Currency,
} from '@/types'
import { EMPTY_ANALYTICS } from '@/lib/analytics-demo'
import { EMPTY_FANDOM }    from '@/lib/fandom-demo'
import { EMPTY_AGENT }     from '@/lib/agent-demo'
import { EMPTY_LEGAL }     from '@/lib/legal-demo'
import { EMPTY_FINANCE }   from '@/lib/finance-demo'

// ── Load ───────────────────────────────────────────────────
export async function loadWorkspaceData(workspaceId: string): Promise<AppData> {
  const supabase = createClient()

  // Fetch clients
  const { data: clientRows, error } = await supabase
    .from('clients')
    .select('id, name, genre, color, analytics, fandom')
    .eq('workspace_id', workspaceId)

  if (error) throw error
  if (!clientRows?.length) return { clients: [] }

  const clientIds = clientRows.map(c => c.id)

  // Fetch all related tables in parallel
  const [
    albums, tracks,
    shows, posts,
    royaltyStreams, deposits, catalogWorks,
    projects, artistTodos,
    tourOffers, contracts,
    invoices, lineItems, expenses, plMonths,
    checklistItems, stakeholders,
    crewMembers, showAdvances, advanceContacts, guestListEntries, travelItems,
  ] = await Promise.all([
    supabase.from('albums').select('*').in('client_id', clientIds),
    supabase.from('tracks').select('*'),
    supabase.from('shows').select('*').in('client_id', clientIds),
    supabase.from('posts').select('*').in('client_id', clientIds),
    supabase.from('royalty_streams').select('*').in('client_id', clientIds),
    supabase.from('deposits').select('*').in('client_id', clientIds),
    supabase.from('catalog_works').select('*').in('client_id', clientIds),
    supabase.from('projects').select('*').in('client_id', clientIds),
    supabase.from('artist_todos').select('*').in('client_id', clientIds),
    supabase.from('tour_offers').select('*').in('client_id', clientIds),
    supabase.from('contracts').select('*').in('client_id', clientIds),
    supabase.from('invoices').select('*').in('client_id', clientIds),
    supabase.from('invoice_line_items').select('*'),
    supabase.from('expenses').select('*').in('client_id', clientIds),
    supabase.from('pl_months').select('*').in('client_id', clientIds),
    supabase.from('checklist_items').select('*'),
    supabase.from('release_stakeholders').select('*'),
    supabase.from('crew_members').select('*').in('client_id', clientIds),
    supabase.from('show_advances').select('*'),
    supabase.from('advance_contacts').select('*'),
    supabase.from('guest_list_entries').select('*'),
    supabase.from('travel_items').select('*'),
  ])

  const albumRows     = albums.data       ?? []
  const trackRows     = tracks.data       ?? []
  const albumIds      = albumRows.map(a => a.id)
  const checklistRows = (checklistItems.data ?? []).filter((i: { album_id: string }) => albumIds.includes(i.album_id))
  const stakeholderRows = (stakeholders.data ?? []).filter((s: { album_id: string }) => albumIds.includes(s.album_id))

  // Tour: advances, crew, guest list and travel are show-scoped, so narrow
  // them to shows in this workspace the same way tracks are narrowed to albums.
  const showIdsAll     = (shows.data ?? []).map((s: { id: string }) => s.id)
  const crewRows       = crewMembers.data ?? []
  const advanceRows    = (showAdvances.data ?? []).filter((a: { show_id: string }) => showIdsAll.includes(a.show_id))
  const advanceIds     = advanceRows.map((a: { id: string }) => a.id)
  const contactRows    = (advanceContacts.data ?? []).filter((ct: { advance_id: string }) => advanceIds.includes(ct.advance_id))
  const guestRows      = (guestListEntries.data ?? []).filter((g: { show_id: string }) => showIdsAll.includes(g.show_id))
  const travelRows     = (travelItems.data ?? []).filter((t: { show_id: string }) => showIdsAll.includes(t.show_id))

  // travel_items is a single table with a `kind` discriminator, so every
  // per-variant column is nullable and gets narrowed back out below.
  type TravelRow = {
    id: string; show_id: string; kind: string; status: string
    confirmation_code?: string; cost?: number; currency?: string; notes?: string
    traveler?: string; airline?: string; flight_number?: string
    from_loc?: string; from_city?: string; to_loc?: string; to_city?: string
    departure?: string; arrival?: string; duration?: string; cabin?: string; seats?: string
    hotel_name?: string; address?: string; phone?: string
    check_in?: string; check_out?: string; room_count?: number; room_type?: string
    ground_type?: string; provider?: string; pickup_time?: string; vehicle_type?: string
  }

  const toTravelItem = (t: TravelRow): TravelItem => {
    const base = {
      id: t.id, showId: t.show_id,
      status: t.status as TravelItem['status'],
      confirmationCode: t.confirmation_code ?? undefined,
      cost: t.cost ?? undefined,
      currency: (t.currency ?? undefined) as Currency | undefined,
      notes: t.notes ?? undefined,
    }
    if (t.kind === 'hotel') {
      return {
        ...base, kind: 'hotel',
        name: t.hotel_name ?? undefined, address: t.address ?? undefined,
        phone: t.phone ?? undefined,
        checkIn: t.check_in ?? undefined, checkOut: t.check_out ?? undefined,
        roomCount: t.room_count ?? undefined, roomType: t.room_type ?? undefined,
      }
    }
    if (t.kind === 'ground') {
      return {
        ...base, kind: 'ground',
        type: t.ground_type as Extract<TravelItem, { kind: 'ground' }>['type'],
        provider: t.provider ?? undefined,
        from: t.from_loc ?? undefined, to: t.to_loc ?? undefined,
        pickupTime: t.pickup_time ?? undefined,
        vehicleType: t.vehicle_type ?? undefined,
      }
    }
    return {
      ...base, kind: 'flight',
      traveler: t.traveler ?? '',
      airline: t.airline ?? undefined, flightNumber: t.flight_number ?? undefined,
      from: t.from_loc ?? undefined, fromCity: t.from_city ?? undefined,
      to: t.to_loc ?? undefined, toCity: t.to_city ?? undefined,
      departure: t.departure ?? undefined, arrival: t.arrival ?? undefined,
      duration: t.duration ?? undefined, cabin: t.cabin ?? undefined,
      seats: t.seats ?? undefined,
    }
  }

  // Build album→tracks lookup (only tracks for albums in this workspace)
  const tracksByAlbum = trackRows
    .filter(t => albumIds.includes(t.album_id))
    .reduce((acc, t) => {
      if (!acc[t.album_id]) acc[t.album_id] = []
      acc[t.album_id].push(t)
      return acc
    }, {} as Record<string, typeof trackRows>)

  // Build invoice→lineItems lookup
  const invoiceIds = (invoices.data ?? []).map((i: { id: string }) => i.id)
  type LineItemRow = { invoice_id: string; description: string; quantity: number; rate: number }
  const itemsByInvoice = (lineItems.data ?? [])
    .filter((li: LineItemRow) => invoiceIds.includes(li.invoice_id))
    .reduce((acc: Record<string, LineItemRow[]>, li: LineItemRow) => {
      if (!acc[li.invoice_id]) acc[li.invoice_id] = []
      acc[li.invoice_id].push(li)
      return acc
    }, {} as Record<string, LineItemRow[]>)

  // Assemble clients
  const clients: Client[] = clientRows.map(c => {
    const cAlbums = albumRows
      .filter(a => a.client_id === c.id)
      .map(a => ({
        id: a.id,
        title: a.title,
        releaseDate: a.release_date ?? undefined,
        tracks: (tracksByAlbum[a.id] ?? [])
          .sort((x: { num: number }, y: { num: number }) => x.num - y.num)
          .map((t: {
            id: string; num: number; title: string; stage: string; version: number; touched: string; notes?: string
            isrc?: string; writers?: string; producers?: string; publisher?: string; pro?: string
            explicit?: boolean; duration?: string; language?: string
            priority?: string; owner?: string; due_date?: string
          }) => ({
            id: t.id, num: t.num, title: t.title,
            stage: t.stage as Track['stage'],
            version: t.version, touched: t.touched, notes: t.notes,
            priority: t.priority as Track['priority'],
            owner: t.owner ?? undefined,
            dueDate: t.due_date ?? undefined,
            labelCopy: {
              isrc: t.isrc ?? undefined, writers: t.writers ?? undefined,
              producers: t.producers ?? undefined, publisher: t.publisher ?? undefined,
              pro: t.pro ?? undefined, explicit: t.explicit ?? undefined,
              duration: t.duration ?? undefined, language: t.language ?? undefined,
            },
          })),
        labelCopy: {
          upc: a.upc ?? undefined, label: a.label ?? undefined,
          primaryArtist: a.primary_artist ?? undefined, genre: a.genre ?? undefined,
          copyrightP: a.copyright_p ?? undefined, copyrightC: a.copyright_c ?? undefined,
        },
        checklist: checklistRows
          .filter((i: { album_id: string }) => i.album_id === a.id)
          .map((i: { key: string; label: string; phase: string; done: boolean; note?: string }) => ({
            key: i.key as ChecklistItem['key'], label: i.label,
            phase: i.phase as ChecklistItem['phase'], done: i.done, note: i.note,
          })),
        stakeholders: stakeholderRows
          .filter((s: { album_id: string }) => s.album_id === a.id)
          .map((s: { id: string; name: string; role: string; org?: string; email?: string; phone?: string; notes?: string }) => ({
            id: s.id, name: s.name, role: s.role as ReleaseStakeholder['role'],
            org: s.org, email: s.email, phone: s.phone, notes: s.notes,
          })),
      }))

    const cShows = (shows.data ?? [])
      .filter((s: { client_id: string }) => s.client_id === c.id)
      .map((s: { id: string; date: string; city: string; venue: string; time: string; status: string; notes?: string }) => ({
        id: s.id, date: s.date, city: s.city,
        venue: s.venue, time: s.time,
        status: s.status as Show['status'], notes: s.notes,
      }))

    const cShowIds = cShows.map((s: { id: string }) => s.id)

    const cAdvances: ShowAdvance[] = advanceRows
      .filter((a: { show_id: string }) => cShowIds.includes(a.show_id))
      .map((a: {
        id: string; show_id: string; status: string; sent_at?: string; completed_at?: string
        schedule: AdvanceSchedule; production: AdvanceProduction
        hospitality: AdvanceHospitality; logistics: AdvanceLogistics
        wifi?: string; wifi_password?: string; weather_notes?: string
        guest_list_cap?: string; guest_list_notes?: string; general_notes?: string
      }) => ({
        id: a.id, showId: a.show_id,
        status: a.status as ShowAdvance['status'],
        sentAt: a.sent_at ?? undefined, completedAt: a.completed_at ?? undefined,
        // The four sections are jsonb bags of optional strings — see migration 003
        schedule:    a.schedule    ?? {},
        production:  a.production  ?? {},
        hospitality: a.hospitality ?? {},
        logistics:   a.logistics   ?? {},
        contacts: contactRows
          .filter((ct: { advance_id: string }) => ct.advance_id === a.id)
          .map((ct: { id: string; role: string; name: string; phone?: string; email?: string; notes?: string }) => ({
            id: ct.id, role: ct.role, name: ct.name,
            phone: ct.phone ?? undefined, email: ct.email ?? undefined,
            notes: ct.notes ?? undefined,
          })),
        wifi: a.wifi ?? undefined, wifiPassword: a.wifi_password ?? undefined,
        weatherNotes: a.weather_notes ?? undefined,
        guestListCap: a.guest_list_cap ?? undefined,
        guestListNotes: a.guest_list_notes ?? undefined,
        generalNotes: a.general_notes ?? undefined,
      }))

    const cCrew: CrewMember[] = crewRows
      .filter((cm: { client_id: string }) => cm.client_id === c.id)
      .map((cm: {
        id: string; name: string; role: string; phone?: string; email?: string
        passport?: string; emergency_name?: string; emergency_phone?: string; notes?: string
      }) => ({
        id: cm.id, name: cm.name, role: cm.role as CrewMember['role'],
        phone: cm.phone ?? undefined, email: cm.email ?? undefined,
        passport: cm.passport ?? undefined,
        emergencyName: cm.emergency_name ?? undefined,
        emergencyPhone: cm.emergency_phone ?? undefined,
        notes: cm.notes ?? undefined,
      }))

    const cGuestList: GuestListEntry[] = guestRows
      .filter((g: { show_id: string }) => cShowIds.includes(g.show_id))
      .map((g: {
        id: string; show_id: string; name: string; qty: number; category: string
        checked_in: boolean; credential?: string; notes?: string
      }) => ({
        id: g.id, showId: g.show_id, name: g.name, qty: g.qty,
        category: g.category as GuestListEntry['category'],
        checkedIn: g.checked_in,
        credential: g.credential ?? undefined, notes: g.notes ?? undefined,
      }))

    const cTravel: TravelItem[] = travelRows
      .filter((t: { show_id: string }) => cShowIds.includes(t.show_id))
      .map(toTravelItem)

    const cPosts = (posts.data ?? [])
      .filter((p: { client_id: string }) => p.client_id === c.id)
      .map((p: { id: string; date: string; title: string; time: string; type: string; release_id?: string; auto?: boolean }) => ({
        id: p.id, date: p.date, title: p.title,
        time: p.time, type: p.type as Post['type'],
        releaseId: p.release_id ?? undefined, auto: p.auto ?? undefined,
      }))

    const cRoyalties = (royaltyStreams.data ?? [])
      .filter((r: { client_id: string }) => r.client_id === c.id)
      .map((r: { id: string; name: string; type: string; amount: number; currency: string; period: string }) => ({
        id: r.id, name: r.name, type: r.type,
        amount: r.amount, currency: r.currency as 'USD'|'GBP'|'EUR', period: r.period,
      }))

    const cDeposits = (deposits.data ?? [])
      .filter((d: { client_id: string }) => d.client_id === c.id)
      .map((d: { id: string; name: string; date: string; amount: number; currency: string; mgmt: number; lawyer: number; taxes: number; done: boolean }) => ({
        id: d.id, name: d.name, date: d.date, amount: d.amount,
        currency: d.currency as 'USD'|'GBP'|'EUR',
        mgmt: d.mgmt, lawyer: d.lawyer, taxes: d.taxes, done: d.done,
      }))

    const cCatalog = (catalogWorks.data ?? [])
      .filter((w: { client_id: string }) => w.client_id === c.id)
      .map((w: { id: string; title: string; ipi?: string; writers: string; amount: number; currency: string; bmi: string; mlc: string; sx: string; ppl: string }) => ({
        id: w.id, title: w.title, ipi: w.ipi, writers: w.writers,
        amount: w.amount, currency: w.currency as 'USD'|'GBP'|'EUR',
        bmi: w.bmi as 'ok'|'warn'|'no'|'q',
        mlc: w.mlc as 'ok'|'warn'|'no'|'q',
        sx:  w.sx  as 'ok'|'warn'|'no'|'q',
        ppl: w.ppl as 'ok'|'warn'|'no'|'q',
      }))

    const cProjects = (projects.data ?? [])
      .filter((p: { client_id: string }) => p.client_id === c.id)
      .map((p: { id: string; title: string; type: string; status: string; assignee?: string; due_date?: string; notes?: string; created_at: string; from_artist: boolean }) => ({
        id: p.id, title: p.title, type: p.type as Project['type'],
        status: p.status as Project['status'],
        assignee: p.assignee as Project['assignee'],
        dueDate: p.due_date ?? undefined, notes: p.notes,
        createdAt: p.created_at, fromArtist: p.from_artist,
      }))

    const cTodos = (artistTodos.data ?? [])
      .filter((t: { client_id: string }) => t.client_id === c.id)
      .map((t: { id: string; title: string; done: boolean; due_date?: string; created_at: string }) => ({
        id: t.id, title: t.title, done: t.done,
        dueDate: t.due_date ?? undefined, createdAt: t.created_at,
      }))

    const cOffers = (tourOffers.data ?? [])
      .filter((o: { client_id: string }) => o.client_id === c.id)
      .map((o: { id: string; venue: string; city: string; country: string; date: string; promoter: string; guarantee: number; door?: number; buyout?: number; status: string; notes?: string; settled_at?: string; net_payout?: number }) => ({
        id: o.id, venue: o.venue, city: o.city, country: o.country,
        date: o.date, promoter: o.promoter, guarantee: o.guarantee,
        door: o.door, buyout: o.buyout, status: o.status as TourOffer['status'],
        notes: o.notes, settledAt: o.settled_at, netPayout: o.net_payout,
      }))

    const cContracts = (contracts.data ?? [])
      .filter((ct: { client_id: string }) => ct.client_id === c.id)
      .map((ct: { id: string; title: string; type: string; status: string; counterparty: string; value?: number; currency?: string; signed_date?: string; expiry_date?: string; notes?: string; created_at: string; flagged: boolean }) => ({
        id: ct.id, title: ct.title, type: ct.type as Contract['type'],
        status: ct.status as Contract['status'],
        counterparty: ct.counterparty, value: ct.value,
        currency: ct.currency as Contract['currency'],
        signedDate: ct.signed_date, expiryDate: ct.expiry_date,
        notes: ct.notes, createdAt: ct.created_at, flagged: ct.flagged,
      }))

    const cInvoices = (invoices.data ?? [])
      .filter((inv: { client_id: string }) => inv.client_id === c.id)
      .map((inv: { id: string; number: string; to_name: string; to_email?: string; category: string; status: string; issued_date: string; due_date: string; paid_date?: string; currency: string; notes?: string }) => ({
        id: inv.id, number: inv.number,
        to: inv.to_name, toEmail: inv.to_email,
        category: inv.category as Invoice['category'],
        status: inv.status as Invoice['status'],
        issuedDate: inv.issued_date, dueDate: inv.due_date,
        paidDate: inv.paid_date, currency: inv.currency as 'USD'|'GBP'|'EUR',
        notes: inv.notes,
        items: (itemsByInvoice[inv.id] ?? []).map((li: { description: string; quantity: number; rate: number }) => ({
          description: li.description, quantity: li.quantity, rate: li.rate,
        })),
      }))

    const cExpenses = (expenses.data ?? [])
      .filter((e: { client_id: string }) => e.client_id === c.id)
      .map((e: { id: string; description: string; vendor: string; amount: number; currency: string; category: string; date: string; paid: boolean }) => ({
        id: e.id, description: e.description, vendor: e.vendor,
        amount: e.amount, currency: e.currency as 'USD'|'GBP'|'EUR',
        category: e.category as Expense['category'],
        date: e.date, paid: e.paid,
      }))

    const cPLMonths = (plMonths.data ?? [])
      .filter((m: { client_id: string }) => m.client_id === c.id)
      .map((m: { month: string; rev_touring: number; rev_streaming: number; rev_sync: number; rev_brand: number; rev_merch: number; rev_other: number; exp_travel: number; exp_recording: number; exp_marketing: number; exp_legal: number; exp_management: number; exp_equipment: number; exp_meals: number; exp_other: number }) => ({
        month: m.month,
        revenue: {
          touring: m.rev_touring, streaming: m.rev_streaming,
          sync: m.rev_sync, brand: m.rev_brand,
          merch: m.rev_merch, other: m.rev_other,
        },
        expenses: {
          travel: m.exp_travel, recording: m.exp_recording,
          marketing: m.exp_marketing, legal: m.exp_legal,
          management: m.exp_management, equipment: m.exp_equipment,
          meals: m.exp_meals, other: m.exp_other,
        },
      } as PLMonth))

    return {
      id: c.id,
      name: c.name,
      genre: c.genre,
      color: c.color,
      songs:    { albums: cAlbums.length ? cAlbums : [{ id: 'alb-default', title: c.name, tracks: [] }] },
      tour:     {
        shows:     cShows,
        advances:  cAdvances,
        crew:      cCrew,
        guestList: cGuestList,
        travel:    cTravel,
      },
      content:  { posts: cPosts },
      business: {
        royalties: { streams: cRoyalties },
        banking:   { deposits: cDeposits },
        catalog:   { works: cCatalog },
      },
      projects:    cProjects,
      artistTodos: cTodos,
      agentData:   { offers: cOffers },
      legal:       { contracts: cContracts },
      finance:     { invoices: cInvoices, expenses: cExpenses, plMonths: cPLMonths },
      // Analytics and fandom come from the JSONB column (external API data)
      analytics: (c.analytics && Object.keys(c.analytics).length > 0)
        ? c.analytics
        : EMPTY_ANALYTICS,
      fandom: (c.fandom && Object.keys(c.fandom).length > 0)
        ? c.fandom
        : EMPTY_FANDOM,
    } as Client
  })

  return { clients }
}

// ── Get current user's workspace + real role ─────────────────
// The role a signed-in user actually holds — not the client-side
// "preview as" toggle. Only a real 'manager' should be able to
// switch that toggle to look at other roles' views.
export async function getMyMembership(): Promise<{ workspaceId: string; role: UserRole } | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .limit(1)
    .single()
  if (!data) return null
  return { workspaceId: data.workspace_id, role: data.role as UserRole }
}

export async function getMyWorkspaceId(): Promise<string | null> {
  const membership = await getMyMembership()
  return membership?.workspaceId ?? null
}

// ── Client upsert ──────────────────────────────────────────
export async function upsertClient(client: Client, workspaceId: string) {
  const supabase = createClient()
  await supabase.from('clients').upsert({
    id: client.id,
    workspace_id: workspaceId,
    name: client.name,
    genre: client.genre,
    color: client.color,
  })
  // Upsert default album if new client
  if (client.songs.albums.length > 0) {
    await supabase.from('albums').upsert(
      client.songs.albums.map(a => ({ id: a.id, client_id: client.id, title: a.title }))
    )
  }
}

export async function deleteClient(clientId: string) {
  const supabase = createClient()
  await supabase.from('clients').delete().eq('id', clientId)
}

// ── Track ──────────────────────────────────────────────────
export async function upsertTrack(track: Track, albumId: string) {
  const supabase = createClient()
  const lc = track.labelCopy
  await supabase.from('tracks').upsert({
    id: track.id, album_id: albumId,
    num: track.num, title: track.title,
    stage: track.stage, version: track.version,
    touched: track.touched, notes: track.notes ?? null,
    priority: track.priority ?? null,
    owner: track.owner ?? null,
    due_date: track.dueDate ?? null,
    isrc: lc?.isrc ?? null, writers: lc?.writers ?? null,
    producers: lc?.producers ?? null, publisher: lc?.publisher ?? null,
    pro: lc?.pro ?? null, explicit: lc?.explicit ?? false,
    duration: lc?.duration ?? null, language: lc?.language ?? null,
  })
}

export async function deleteTrack(trackId: string) {
  const supabase = createClient()
  await supabase.from('tracks').delete().eq('id', trackId)
}

// ── Album ──────────────────────────────────────────────────
export async function upsertAlbum(album: Album, clientId: string) {
  const supabase = createClient()
  const lc = album.labelCopy
  await supabase.from('albums').upsert({
    id: album.id, client_id: clientId, title: album.title,
    release_date: album.releaseDate ?? null,
    upc: lc?.upc ?? null, label: lc?.label ?? null,
    primary_artist: lc?.primaryArtist ?? null, genre: lc?.genre ?? null,
    copyright_p: lc?.copyrightP ?? null, copyright_c: lc?.copyrightC ?? null,
  })
}

// ── Checklist items ──────────────────────────────────────────
export async function upsertChecklistItem(item: ChecklistItem, albumId: string) {
  const supabase = createClient()
  await supabase.from('checklist_items').upsert(
    { album_id: albumId, key: item.key, label: item.label, phase: item.phase, done: item.done, note: item.note ?? null },
    { onConflict: 'album_id,key' }
  )
}

export async function upsertChecklist(items: ChecklistItem[], albumId: string) {
  const supabase = createClient()
  await supabase.from('checklist_items').upsert(
    items.map(item => ({ album_id: albumId, key: item.key, label: item.label, phase: item.phase, done: item.done, note: item.note ?? null })),
    { onConflict: 'album_id,key' }
  )
}

// ── Release stakeholders ──────────────────────────────────────
export async function upsertStakeholder(stakeholder: ReleaseStakeholder, albumId: string) {
  const supabase = createClient()
  await supabase.from('release_stakeholders').upsert({
    id: stakeholder.id, album_id: albumId,
    name: stakeholder.name, role: stakeholder.role,
    org: stakeholder.org ?? null, email: stakeholder.email ?? null,
    phone: stakeholder.phone ?? null, notes: stakeholder.notes ?? null,
  })
}

export async function deleteStakeholder(stakeholderId: string) {
  const supabase = createClient()
  await supabase.from('release_stakeholders').delete().eq('id', stakeholderId)
}

// ── Show ───────────────────────────────────────────────────
export async function upsertShow(show: Show, clientId: string) {
  const supabase = createClient()
  await supabase.from('shows').upsert({
    id: show.id, client_id: clientId,
    date: show.date, city: show.city,
    venue: show.venue, time: show.time,
    status: show.status, notes: show.notes ?? null,
  })
}

export async function deleteShow(showId: string) {
  const supabase = createClient()
  await supabase.from('shows').delete().eq('id', showId)
}

// ── Post ───────────────────────────────────────────────────
export async function upsertPost(post: Post, clientId: string) {
  const supabase = createClient()
  await supabase.from('posts').upsert({
    id: post.id, client_id: clientId,
    date: post.date, title: post.title,
    time: post.time, type: post.type,
    release_id: post.releaseId ?? null, auto: post.auto ?? false,
  })
}

export async function deletePost(postId: string) {
  const supabase = createClient()
  await supabase.from('posts').delete().eq('id', postId)
}

/** Replaces the auto-generated rollout posts for a release in one round trip. */
export async function replaceAutoPosts(posts: Post[], clientId: string, releaseId: string) {
  const supabase = createClient()
  await supabase.from('posts').delete().eq('release_id', releaseId).eq('auto', true)
  if (posts.length > 0) {
    await supabase.from('posts').insert(
      posts.map(p => ({
        id: p.id, client_id: clientId, date: p.date, title: p.title,
        time: p.time, type: p.type, release_id: releaseId, auto: true,
      }))
    )
  }
}

// ── Deposit ────────────────────────────────────────────────
export async function upsertDeposit(
  deposit: { id: string; name: string; date: string; amount: number; currency: string; mgmt: number; lawyer: number; taxes: number; done: boolean },
  clientId: string
) {
  const supabase = createClient()
  await supabase.from('deposits').upsert({
    id: deposit.id, client_id: clientId,
    name: deposit.name, date: deposit.date, amount: deposit.amount,
    currency: deposit.currency, mgmt: deposit.mgmt,
    lawyer: deposit.lawyer, taxes: deposit.taxes, done: deposit.done,
  })
}

export async function deleteDeposit(depositId: string) {
  const supabase = createClient()
  await supabase.from('deposits').delete().eq('id', depositId)
}

// ── Project ────────────────────────────────────────────────
export async function upsertProject(project: Project, clientId: string) {
  const supabase = createClient()
  await supabase.from('projects').upsert({
    id: project.id, client_id: clientId,
    title: project.title, type: project.type,
    status: project.status, assignee: project.assignee ?? null,
    due_date: project.dueDate ?? null, notes: project.notes ?? null,
    created_at: project.createdAt, from_artist: project.fromArtist,
  })
}

export async function deleteProject(projectId: string) {
  const supabase = createClient()
  await supabase.from('projects').delete().eq('id', projectId)
}

// ── Artist Todo ────────────────────────────────────────────
export async function upsertArtistTodo(todo: ArtistTodo, clientId: string) {
  const supabase = createClient()
  await supabase.from('artist_todos').upsert({
    id: todo.id, client_id: clientId,
    title: todo.title, done: todo.done,
    due_date: todo.dueDate ?? null, created_at: todo.createdAt,
  })
}

export async function deleteArtistTodo(todoId: string) {
  const supabase = createClient()
  await supabase.from('artist_todos').delete().eq('id', todoId)
}

// ── Invoice ────────────────────────────────────────────────
export async function upsertInvoice(invoice: Invoice, clientId: string) {
  const supabase = createClient()
  await supabase.from('invoices').upsert({
    id: invoice.id, client_id: clientId,
    number: invoice.number, to_name: invoice.to,
    to_email: invoice.toEmail ?? null,
    category: invoice.category, status: invoice.status,
    issued_date: invoice.issuedDate, due_date: invoice.dueDate,
    paid_date: invoice.paidDate ?? null, currency: invoice.currency,
    notes: invoice.notes ?? null,
  })
  // Upsert line items
  await supabase.from('invoice_line_items').delete().eq('invoice_id', invoice.id)
  if (invoice.items.length > 0) {
    await supabase.from('invoice_line_items').insert(
      invoice.items.map((item, i) => ({
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        rate: item.rate,
        sort_order: i,
      }))
    )
  }
}

// ── Crew ───────────────────────────────────────────────────
export async function upsertCrewMember(member: CrewMember, clientId: string) {
  const supabase = createClient()
  await supabase.from('crew_members').upsert({
    id: member.id, client_id: clientId,
    name: member.name, role: member.role,
    phone: member.phone ?? null, email: member.email ?? null,
    passport: member.passport ?? null,
    emergency_name: member.emergencyName ?? null,
    emergency_phone: member.emergencyPhone ?? null,
    notes: member.notes ?? null,
  })
}

export async function deleteCrewMember(memberId: string) {
  const supabase = createClient()
  await supabase.from('crew_members').delete().eq('id', memberId)
}

// ── Show Advance ───────────────────────────────────────────
export async function upsertAdvance(advance: ShowAdvance) {
  const supabase = createClient()
  await supabase.from('show_advances').upsert({
    id: advance.id, show_id: advance.showId,
    status: advance.status,
    sent_at: advance.sentAt ?? null,
    completed_at: advance.completedAt ?? null,
    schedule:    advance.schedule    ?? {},
    production:  advance.production  ?? {},
    hospitality: advance.hospitality ?? {},
    logistics:   advance.logistics   ?? {},
    wifi: advance.wifi ?? null,
    wifi_password: advance.wifiPassword ?? null,
    weather_notes: advance.weatherNotes ?? null,
    guest_list_cap: advance.guestListCap ?? null,
    guest_list_notes: advance.guestListNotes ?? null,
    general_notes: advance.generalNotes ?? null,
  })
  // Contacts are replaced wholesale, same as invoice line items
  await supabase.from('advance_contacts').delete().eq('advance_id', advance.id)
  const contacts: AdvanceContact[] = advance.contacts ?? []
  if (contacts.length > 0) {
    await supabase.from('advance_contacts').insert(
      contacts.map(ct => ({
        id: ct.id, advance_id: advance.id,
        role: ct.role, name: ct.name,
        phone: ct.phone ?? null, email: ct.email ?? null,
        notes: ct.notes ?? null,
      }))
    )
  }
}

export async function deleteAdvance(advanceId: string) {
  const supabase = createClient()
  await supabase.from('show_advances').delete().eq('id', advanceId)
}

// ── Guest List ─────────────────────────────────────────────
export async function upsertGuestListEntry(entry: GuestListEntry) {
  const supabase = createClient()
  await supabase.from('guest_list_entries').upsert({
    id: entry.id, show_id: entry.showId,
    name: entry.name, qty: entry.qty,
    category: entry.category, checked_in: entry.checkedIn,
    credential: entry.credential ?? null, notes: entry.notes ?? null,
  })
}

export async function deleteGuestListEntry(entryId: string) {
  const supabase = createClient()
  await supabase.from('guest_list_entries').delete().eq('id', entryId)
}

// ── Travel ─────────────────────────────────────────────────
/**
 * Flattens the TravelItem union onto the single travel_items row shape.
 * Columns belonging to the other two variants are explicitly nulled so
 * changing an item's `kind` doesn't leave stale values behind.
 */
function travelItemToRow(item: TravelItem) {
  const base = {
    id: item.id, show_id: item.showId,
    kind: item.kind, status: item.status,
    confirmation_code: item.confirmationCode ?? null,
    cost: item.cost ?? null,
    currency: item.currency ?? null,
    notes: item.notes ?? null,
    // per-variant columns, cleared by default
    traveler: null as string | null, airline: null as string | null,
    flight_number: null as string | null,
    from_loc: null as string | null, from_city: null as string | null,
    to_loc: null as string | null, to_city: null as string | null,
    departure: null as string | null, arrival: null as string | null,
    duration: null as string | null, cabin: null as string | null,
    seats: null as string | null,
    hotel_name: null as string | null, address: null as string | null,
    phone: null as string | null,
    check_in: null as string | null, check_out: null as string | null,
    room_count: null as number | null, room_type: null as string | null,
    ground_type: null as string | null, provider: null as string | null,
    pickup_time: null as string | null, vehicle_type: null as string | null,
  }

  if (item.kind === 'flight') {
    return {
      ...base,
      traveler: item.traveler,           // NOT NULL for flights (migration 003)
      airline: item.airline ?? null,
      flight_number: item.flightNumber ?? null,
      from_loc: item.from ?? null, from_city: item.fromCity ?? null,
      to_loc: item.to ?? null, to_city: item.toCity ?? null,
      departure: item.departure ?? null, arrival: item.arrival ?? null,
      duration: item.duration ?? null, cabin: item.cabin ?? null,
      seats: item.seats ?? null,
    }
  }
  if (item.kind === 'hotel') {
    return {
      ...base,
      hotel_name: item.name ?? null, address: item.address ?? null,
      phone: item.phone ?? null,
      check_in: item.checkIn ?? null, check_out: item.checkOut ?? null,
      room_count: item.roomCount ?? null, room_type: item.roomType ?? null,
    }
  }
  return {
    ...base,
    ground_type: item.type,              // NOT NULL for ground (migration 003)
    provider: item.provider ?? null,
    from_loc: item.from ?? null, to_loc: item.to ?? null,
    pickup_time: item.pickupTime ?? null,
    vehicle_type: item.vehicleType ?? null,
  }
}

export async function upsertTravelItem(item: TravelItem) {
  const supabase = createClient()
  await supabase.from('travel_items').upsert(travelItemToRow(item))
}

export async function deleteTravelItem(itemId: string) {
  const supabase = createClient()
  await supabase.from('travel_items').delete().eq('id', itemId)
}
