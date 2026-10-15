'use client'
// ──────────────────────────────────────────────────────────
//  StudioApp — the root component
//  This wires together all the views based on the global state.
//
//  Manager sees everything. Artist gets their own fixed-client
//  dashboard portal (no roster). Everyone else (agent/lawyer/team)
//  gets the exact same Subnav + section views as Manager, just
//  filtered down to whatever access_grants gave them — no more
//  separate hand-built portals per role.
// ──────────────────────────────────────────────────────────

import { useStore } from '@/lib/store'
import { effectiveSub, shareOnlyTabs } from '@/lib/item-access'
import { canOpenSection, visibleTourTabs } from '@/lib/tour-tabs'
import { AppHeader }  from '@/components/layout/AppHeader'
import { Subnav }     from '@/components/layout/Subnav'
import { Rail }       from '@/components/layout/Rail'
import { CommandBar } from '@/components/layout/CommandBar'
import { ShowProgressBar } from '@/components/tour/ShowProgressBar'
import { Toaster } from '@/components/ui/Toaster'
import { CalendarView } from '@/components/calendar/CalendarView'

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
import { LegalView }     from '@/components/legal/LegalView'

// Artist portal
import { ArtistView }   from '@/components/artist/ArtistView'

// Tour subviews
import { AdvanceView }  from '@/components/tour/AdvanceView'
import { DaySheetView } from '@/components/tour/DaySheetView'
import { TravelView }   from '@/components/tour/TravelView'
import { GuestListView } from '@/components/tour/GuestListView'
import { CrewView }      from '@/components/tour/CrewView'
import { OffersView }    from '@/components/tour/OffersView'
import { BudgetView }    from '@/components/tour/BudgetView'
import { SettlementsView } from '@/components/tour/SettlementsView'
import { TodayList } from '@/components/dashboard/TodayList'
import { ActivityView } from '@/components/activity/ActivityView'
import { ProfileView } from '@/components/profile/ProfileView'
import { ARTIST_SIDE_NAME, PRODUCT_NAME } from '@/lib/brand'

export function StudioApp() {
  const { view, section, songsSub: rawSongsSub, contentSub: rawContentSub, bizSub: rawBizSub, tourSub: rawTourSub, clientId, data, role, hasAccess, isShareOnly, accessibleClientIds, openModal, isLoading } = useStore()
  // Someone with only a shared item lands on a tab that shows it, not an empty one.
  const allowedTabs = isShareOnly(section) ? shareOnlyTabs(section, data.clients.find(c => c.id === clientId)) : undefined
  const songsSub = effectiveSub(rawSongsSub, allowedTabs) as typeof rawSongsSub
  const contentSub = effectiveSub(rawContentSub, allowedTabs) as typeof rawContentSub
  const bizSub = effectiveSub(rawBizSub, allowedTabs) as typeof rawBizSub
  // The Tour page opens for Tour, for Deals & fees alone, or both; each person lands on a tab they actually have.
  const tourTabs = visibleTourTabs({
    tour: hasAccess('tour'), deals: hasAccess('deals'), finance: role !== 'artist' && hasAccess('finance'),
    sharedTabs: isShareOnly('tour') ? shareOnlyTabs('tour', data.clients.find(c => c.id === clientId)) : undefined,
  })
  const tourSub = effectiveSub(rawTourSub, tourTabs.length > 0 ? tourTabs : undefined) as typeof rawTourSub

  // Show loading spinner while Supabase data is hydrating
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-canvas">
        <div className="text-center">
          <div className="font-serif font-semibold text-xl tracking-tight mb-3">{PRODUCT_NAME}</div>
          <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin mx-auto" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-gray-900">
      {role !== 'artist' && <Rail />}
      <div className="flex-1 min-w-0 flex flex-col">
        <AppHeader />

        {/* ── Dashboard (roster) — hidden entirely for artists, who land straight in their own client ── */}
        {view === 'dashboard' && role !== 'artist' && (() => {
          const visibleIds = accessibleClientIds()
          const roster = visibleIds === 'all' ? data.clients : data.clients.filter(c => visibleIds.includes(c.id))
          return (
            <main className="flex-1 overflow-auto p-4 md:p-8">
              <TodayList />

              <div className="flex items-end justify-between mb-4">
                <div>
                  <h2 className="font-serif text-xl font-medium leading-tight">Your artists</h2>
                  <p className="text-sm text-gray-400 mt-0.5">{roster.length} client{roster.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(310px,100%),1fr))] gap-4">
                {roster.map(c => <ClientCard key={c.id} client={c} />)}

                {role === 'manager' && (
                  <button
                    onClick={() => openModal('add-client')}
                    className="border-2 border-dashed border-gray-200 rounded-2xl p-5 min-h-[220px] flex flex-col items-center justify-center gap-2 text-gray-400 hover:border-accent hover:text-accent transition-colors"
                  >
                    <span className="text-3xl">+</span>
                    <span className="text-sm font-medium">Add a client</span>
                  </button>
                )}
              </div>

              {roster.length === 0 && (
                <div className="text-center text-gray-300 py-16 text-sm">No clients you have access to yet</div>
              )}

              <DashboardModals />
            </main>
          )
        })()}

        {/* ── Studio: Artist portal ── */}
        {view === 'studio' && role === 'artist' && <ArtistView />}

        {/* ── Studio: everyone else shares the real Manager views, gated by hasAccess() ── */}
        {view === 'studio' && role !== 'artist' && (
          canOpenSection(section, s => hasAccess(s)) ? (
            <>
              <Subnav />
              {section === 'tour' && ['advance', 'daysheet', 'travel', 'guests'].includes(tourSub) && <ShowProgressBar />}
              <div className="flex-1 min-h-0 flex overflow-hidden">
                {section === 'songs'    && (
                  songsSub === 'labelcopy' ? <LabelCopyView /> :
                  songsSub === 'checklist' ? <ChecklistView /> :
                  songsSub === 'status'    ? <StatusView />    :
                  <SongsView />
                )}
                {section === 'tour'     && (
                  tourSub === 'offers'   ? <OffersView />           :
                  tourSub === 'budget'   ? <BudgetView />           :
                  tourSub === 'settlements' ? <SettlementsView />   :
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
                {section === 'finance'  && (
                  bizSub === 'banking'  ? <BankingView />   :
                  bizSub === 'catalog'  ? <CatalogView />   :
                  bizSub === 'pl'       ? <PLView />        :
                  bizSub === 'invoices' ? <InvoicesView />  :
                  bizSub === 'payments' ? <PaymentsView />  :
                  <RoyaltiesView />
                )}
                {section === 'calendar'   && <CalendarView />}
                {section === 'projects'   && <ProjectsView />}
                {section === 'analytics'  && <AnalyticsView />}
                {section === 'team'       && <TeamView />}
                {section === 'legal'      && <LegalView />}
                {section === 'activity'   && <ActivityView />}
                {section === 'profile'    && <ProfileView />}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              You don&apos;t have access to this section for this client.
            </div>
          )
        )}

        {/* Artists have no side rail, so their credit line sits at the foot of the page */}
        {role === 'artist' && (
          <div className="flex-shrink-0 text-center py-1.5 text-[10px] uppercase tracking-widest text-gray-400 border-t border-gray-100">
            {`${ARTIST_SIDE_NAME} · powered by ${PRODUCT_NAME}`}
          </div>
        )}
      </div>
      {role !== 'artist' && <CommandBar />}
      <Toaster />
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
