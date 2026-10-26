'use client'
// ──────────────────────────────────────────────────────────
//  RosterToday — "All artists" → Today: what needs this person across every artist, who needs them most, then the artists themselves
//  (grouped by company for someone who works under several), plus the company invites, setup and cash forecast.
// ──────────────────────────────────────────────────────────

import { useStore } from '@/lib/store'
import { CompanySetupCard } from '@/components/dashboard/CompanySetupCard'
import { CompanyInvitesCard, YourCompaniesCard } from '@/components/dashboard/CompaniesCards'
import { ForecastCard } from '@/components/dashboard/ForecastCard'
import { ClientCard } from '@/components/dashboard/ClientCard'
import { TodayList } from '@/components/dashboard/TodayList'
import { AttentionTable } from '@/components/dashboard/AttentionTable'

export function RosterToday() {
  const { data, role, accessibleClientIds, openModal, goToCompany, contexts, clientWorkspace, homeWorkspaceId } = useStore()
  const visibleIds = accessibleClientIds()
  const roster = visibleIds === 'all' ? data.clients : data.clients.filter(c => visibleIds.includes(c.id))
  // Someone who works under several companies sees each company's artists under its own name (their home company first).
  const companies = Object.values(contexts)
  const grouped = companies.length > 1
  const order = [homeWorkspaceId, ...companies.map(c => c.workspaceId)].filter((w, i, a): w is string => !!w && a.indexOf(w) === i)
  const names = Object.fromEntries(companies.map(c => [c.workspaceId, c.companyName || 'Company']))
  const groups = grouped
    ? order.map(ws => ({ ws, name: names[ws], clients: roster.filter(c => clientWorkspace[c.id] === ws), canAdd: contexts[ws]?.role === 'manager' }))
        .filter(g => g.clients.length > 0 || g.canAdd)
    : []
  const addTile = (ws?: string) => (
    <button
      onClick={() => openModal('add-client', ws ? { workspaceId: ws } : {})}
      className="border-2 border-dashed border-gray-200 rounded-2xl p-5 min-h-[220px] flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-accent hover:text-accent transition-colors"
    >
      <span className="text-3xl">+</span>
      <span className="text-sm font-medium">Add a client</span>
    </button>
  )
  return (
    <>
      <CompanyInvitesCard />
      <CompanySetupCard />
      <TodayList />
      <AttentionTable />
      <ForecastCard />

      <div className="flex items-end justify-between mb-4">
        <div>
          <h2 className="font-serif text-xl font-medium leading-tight">Your artists</h2>
          <p className="text-sm text-gray-400 mt-0.5">{roster.length} client{roster.length !== 1 ? 's' : ''}</p>
        </div>
        {role === 'manager' && (
          <button onClick={() => goToCompany()} className="text-xs font-medium text-accent hover:underline">Your team and what they can open →</button>
        )}
      </div>

      {grouped ? (
        <div className="flex flex-col gap-8">
          {groups.map(g => (
            <section key={g.ws} aria-label={g.name}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{g.name}</h3>
                <span className="text-xs text-gray-400">{g.clients.length} client{g.clients.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(310px,100%),1fr))] gap-4">
                {g.clients.map(c => <ClientCard key={c.id} client={c} />)}
                {g.canAdd && addTile(g.ws)}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(310px,100%),1fr))] gap-4">
          {roster.map(c => <ClientCard key={c.id} client={c} />)}
          {role === 'manager' && addTile()}
        </div>
      )}

      {roster.length === 0 && (
        <div className="text-center text-gray-300 py-16 text-sm">No clients you have access to yet</div>
      )}

      <YourCompaniesCard />
    </>
  )
}
