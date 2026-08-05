'use client'
// ──────────────────────────────────────────────────────────
//  StudioApp — the root component
//  This wires together all the views based on the global state.
//
//  Two roles:
//   • manager — full workspace with all sections + Projects tab
//   • artist  — clean portal: releases, shows, content, todos
// ──────────────────────────────────────────────────────────

import { useStore } from '@/lib/store'
import { AppHeader }  from '@/components/layout/AppHeader'
import { Subnav }     from '@/components/layout/Subnav'

// Dashboard
import { ClientCard }      from '@/components/dashboard/ClientCard'
import { DashboardModals } from '@/components/dashboard/Modals'

// Manager views
import { SongsView }    from '@/components/songs/SongsView'
import { LabelCopyView } from '@/components/songs/LabelCopyView'
import { ChecklistView } from '@/components/songs/ChecklistView'
import { StatusView }    from '@/components/songs/StatusView'
import { TeamView }      from '@/components/team/TeamView'
import { TourView }     from '@/components/tour/TourView'
import { ManageView }   from '@/components/content/ManageView'
import { StudioView }   from '@/components/content/StudioView'
import { RoyaltiesView } from '@/components/business/RoyaltiesView'
import { BankingView }   from '@/components/business/BankingView'
import { CatalogView }   from '@/components/business/CatalogView'
import { PLView }        from '@/components/business/PLView'
import { InvoicesView }  from '@/components/business/InvoicesView'
import { PaymentsView }  from '@/components/business/PaymentsView'
import { ProjectsView }  from '@/components/manager/ProjectsView'
import { AnalyticsView } from '@/components/analytics/AnalyticsView'
import { FandomView }    from '@/components/fandom/FandomView'

// Specialist views
import { ArtistView }   from '@/components/artist/ArtistView'
import { AgentView }    from '@/components/agent/AgentView'
import { LawyerView }   from '@/components/lawyer/LawyerView'
import { AdvanceView }  from '@/components/tour/AdvanceView'
import { DaySheetView } from '@/components/tour/DaySheetView'
import { TravelView }   from '@/components/tour/TravelView'
import { GuestListView } from '@/components/tour/GuestListView'
import { CrewView }      from '@/components/tour/CrewView'

export function StudioApp() {
  const { view, section, songsSub, contentSub, bizSub, tourSub, data, role, openModal, isLoading } = useStore()

  // Show loading spinner while Supabase data is hydrating
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-canvas">
        <div className="text-center">
          <div className="font-serif font-semibold text-xl tracking-tight mb-3">Mgmt Studio</div>
          <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-canvas text-gray-900">
      <AppHeader />

      {/* ── Dashboard ── */}
      {view === 'dashboard' && (
        <main className="flex-1 overflow-auto p-8">
          <div className="flex items-end justify-between mb-7">
            <div>
              <h1 className="font-serif text-[26px] font-medium leading-tight">Your Roster</h1>
              <p className="text-sm text-gray-400 mt-0.5">{data.clients.length} client{data.clients.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(310px,1fr))] gap-4">
            {data.clients.map(c => <ClientCard key={c.id} client={c} />)}

            <button
              onClick={() => openModal('add-client')}
              className="border-2 border-dashed border-gray-200 rounded-2xl p-5 min-h-[220px] flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-blue-400 hover:text-blue-400 transition-colors"
            >
              <span className="text-3xl">+</span>
              <span className="text-sm font-medium">Add a client</span>
            </button>
          </div>

          <DashboardModals />
        </main>
      )}

      {/* ── Studio: Specialist views ── */}
      {view === 'studio' && role === 'artist' && <ArtistView />}
      {view === 'studio' && role === 'agent'  && <AgentView />}
      {view === 'studio' && role === 'lawyer' && <LawyerView />}

      {/* ── Studio: Manager view ── */}
      {view === 'studio' && role === 'manager' && (
        <>
          <Subnav />
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {section === 'songs'    && (
              songsSub === 'labelcopy' ? <LabelCopyView /> :
              songsSub === 'checklist' ? <ChecklistView /> :
              songsSub === 'status'    ? <StatusView />    :
              <SongsView />
            )}
            {section === 'tour'     && (
              tourSub === 'advance'  ? <AdvanceView />          :
              tourSub === 'daysheet' ? <DaySheetView />         :
              tourSub === 'travel'   ? <TravelView />           :
              tourSub === 'crew'     ? <CrewView />             :
              tourSub === 'guests'   ? <GuestListView />        :
              <TourView />
            )}
            {section === 'content'  && (
              contentSub === 'studio' ? <StudioView />    :
              contentSub === 'lab'    ? <LabPlaceholder /> :
              <ManageView />
            )}
            {section === 'business' && (
              bizSub === 'banking'  ? <BankingView />   :
              bizSub === 'catalog'  ? <CatalogView />   :
              bizSub === 'pl'       ? <PLView />        :
              bizSub === 'invoices' ? <InvoicesView />  :
              bizSub === 'payments' ? <PaymentsView />  :
              <RoyaltiesView />
            )}
            {section === 'projects'   && <ProjectsView />}
            {section === 'analytics'  && <AnalyticsView />}
            {section === 'fandom'     && <FandomView />}
            {section === 'team'       && <TeamView />}
          </div>
        </>
      )}

      {/* Footer */}
      <div className="flex-shrink-0 text-center py-1.5 text-[10px] uppercase tracking-widest text-gray-300 border-t border-gray-100">
        Mgmt Studio · Music Management · v0.1
      </div>
    </div>
  )
}

function LabPlaceholder() {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">In Development</div>
      <div className="border border-gray-100 rounded-2xl p-4 mb-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-sm">Typewriter Text</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700">Refining · 2 builds</span>
        </div>
      </div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 mt-6">Shipped to Studio</div>
      {['Big Text / One Word At a Time', 'Collage A', 'Frame B', 'Dark Film Grade'].map(n => (
        <div key={n} className="border border-gray-100 rounded-2xl p-4 mb-2 flex items-center justify-between">
          <span className="font-semibold text-sm">{n}</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-600">Shipped</span>
        </div>
      ))}
    </div>
  )
}
