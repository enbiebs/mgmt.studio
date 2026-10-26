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
import { canOpenSection } from '@/lib/tour-tabs'
import { useTourTabs } from '@/components/tour/useTourTabs'
import { CompanyView } from '@/components/company/CompanyView'
import { AppHeader }  from '@/components/layout/AppHeader'
import { Subnav }     from '@/components/layout/Subnav'
import { Sidebar }    from '@/components/layout/Sidebar'
import { CommandBar } from '@/components/layout/CommandBar'
import { Toaster } from '@/components/ui/Toaster'
import { ConfirmHost } from '@/components/ui/ConfirmHost'
import { UrlSync } from '@/components/layout/UrlSync'
import { sectionLabel } from '@/components/layout/nav'
import { CalendarView } from '@/components/calendar/CalendarView'
import { OverviewView } from '@/components/overview/OverviewView'

// Dashboard
import { DashboardModals } from '@/components/dashboard/Modals'
import { RosterToday }     from '@/components/dashboard/RosterToday'
import { ArtistPicker }    from '@/components/dashboard/ArtistPicker'
import { RosterTour }      from '@/components/tour/RosterTour'

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
import { ForecastView }  from '@/components/business/ForecastView'
import { ProjectsView }  from '@/components/manager/ProjectsView'
import { AnalyticsView } from '@/components/analytics/AnalyticsView'
import { LegalView }     from '@/components/legal/LegalView'

// Artist portal
import { ArtistView }   from '@/components/artist/ArtistView'

// Tour subviews
import { CrewView }      from '@/components/tour/CrewView'
import { MoneyView }     from '@/components/tour/MoneyView'
import { OffersView }    from '@/components/tour/OffersView'
import { TodayList } from '@/components/dashboard/TodayList'
import { ActivityView } from '@/components/activity/ActivityView'
import { ProfileView } from '@/components/profile/ProfileView'
import { ARTIST_SIDE_NAME, PRODUCT_NAME } from '@/lib/brand'

export function StudioApp() {
  const { view, section, rosterPage, songsSub: rawSongsSub, contentSub: rawContentSub, bizSub: rawBizSub, tourSub: rawTourSub, clientId, data, role, hasAccess, isShareOnly, isLoading, workspaceId } = useStore()
  // Someone with only a shared item lands on a tab that shows it, not an empty one.
  const allowedTabs = isShareOnly(section) ? shareOnlyTabs(section, data.clients.find(c => c.id === clientId)) : undefined
  const songsSub = effectiveSub(rawSongsSub, allowedTabs) as typeof rawSongsSub
  const contentSub = effectiveSub(rawContentSub, allowedTabs) as typeof rawContentSub
  const bizSub = effectiveSub(rawBizSub, allowedTabs) as typeof rawBizSub
  // The Tour page opens for Tour, for Deals & fees alone, or both; each person lands on a tab they actually have.
  const tourTabs = useTourTabs()
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
    <div className="app-shell flex h-screen overflow-hidden bg-canvas text-gray-900">
      {role !== 'artist' && <Sidebar />}
      <div className="flex-1 min-w-0 flex flex-col">
        <AppHeader />

        {/* ── All artists — hidden entirely for artists, who land straight in their own client ── */}
        {view === 'dashboard' && role !== 'artist' && (
          rosterPage === 'calendar' ? (
            <div className="glass-sheet flex-1 min-h-0 flex flex-col">
              <h1 className="sr-only">Calendar · All artists</h1>
              <CalendarView roster />
            </div>
          ) : (
            <main className="flex-1 overflow-auto p-4 md:p-8">
              {rosterPage === 'today' ? <RosterToday />
                : rosterPage === 'tour' ? <RosterTour />
                : <ArtistPicker page={rosterPage} />}
            </main>
          )
        )}
        {view === 'dashboard' && role !== 'artist' && <DashboardModals />}

        {/* ── Company: everyone's access to every artist (managers) ── */}
        {view === 'company' && role === 'manager' && (
          <div className="glass-sheet flex-1 min-h-0 flex flex-col">
            <CompanyView key={workspaceId ?? 'company'} />
          </div>
        )}

        {/* ── Studio: one near-solid frosted sheet holds the artist's pages (plain wrapper in the solid look) ── */}
        {view === 'studio' && (
          // Keyed by artist, so moving to another artist never carries a half-typed edit or a selected show across to them
          <div key={clientId ?? 'none'} className="glass-sheet flex-1 min-h-0 flex flex-col">
            {/* One page heading for screen readers on the pages that do not draw their own (the Profile page, the Overview, the Today list and the portal do) */}
            {role !== 'artist' && section !== 'profile' && section !== 'today' && section !== 'overview' && (
              <h1 className="sr-only">{sectionLabel(section)} · {data.clients.find(c => c.id === clientId)?.name}</h1>
            )}
            {/* Artist portal */}
            {role === 'artist' && <ArtistView />}

            {/* Everyone else shares the real Manager views, gated by hasAccess() */}
            {role !== 'artist' && (
              canOpenSection(section, s => hasAccess(s)) ? (
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
                      // Four tabs: Shows (a show and its steps: details, advance, travel, guests, day sheet), Offers, Money, Crew.
                      tourSub === 'offers'   ? <OffersView />           :
                      tourSub === 'budget' || tourSub === 'settlements' ? <MoneyView /> :
                      tourSub === 'crew'     ? <CrewView />             :
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
                      bizSub === 'forecast' ? <ForecastView />  :
                      <RoyaltiesView />
                    )}
                    {section === 'overview'   && <OverviewView />}
                    {section === 'today'      && <main className="flex-1 overflow-auto p-4 md:p-8"><TodayList clientId={clientId ?? undefined} /></main>}
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
          </div>
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
      <ConfirmHost />
      <UrlSync />
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
