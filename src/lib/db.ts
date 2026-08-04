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
  AppData, Client, Track, Show, Post,
  Project, ArtistTodo, TourOffer, Contract,
  Invoice, Expense, PLMonth,
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
  ])

  const albumRows     = albums.data       ?? []
  const trackRows     = tracks.data       ?? []
  const albumIds      = albumRows.map(a => a.id)

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
          .map((t: { id: string; num: number; title: string; stage: string; version: number; touched: string; notes?: string }) => ({
            id: t.id, num: t.num, title: t.title,
            stage: t.stage as Track['stage'],
            version: t.version, touched: t.touched, notes: t.notes,
          })),
      }))

    const cShows = (shows.data ?? [])
      .filter((s: { client_id: string }) => s.client_id === c.id)
      .map((s: { id: string; date: string; city: string; venue: string; time: string; status: string; notes?: string }) => ({
        id: s.id, date: s.date, city: s.city,
        venue: s.venue, time: s.time,
        status: s.status as Show['status'], notes: s.notes,
      }))

    const cPosts = (posts.data ?? [])
      .filter((p: { client_id: string }) => p.client_id === c.id)
      .map((p: { id: string; date: string; title: string; time: string; type: string }) => ({
        id: p.id, date: p.date, title: p.title,
        time: p.time, type: p.type as Post['type'],
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
      tour:     { shows: cShows },
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

// ── Get current user's workspace ID ────────────────────────
export async function getMyWorkspaceId(): Promise<string | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .limit(1)
    .single()
  return data?.workspace_id ?? null
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
  await supabase.from('tracks').upsert({
    id: track.id, album_id: albumId,
    num: track.num, title: track.title,
    stage: track.stage, version: track.version,
    touched: track.touched, notes: track.notes ?? null,
  })
}

export async function deleteTrack(trackId: string) {
  const supabase = createClient()
  await supabase.from('tracks').delete().eq('id', trackId)
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
  })
}

export async function deletePost(postId: string) {
  const supabase = createClient()
  await supabase.from('posts').delete().eq('id', postId)
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
