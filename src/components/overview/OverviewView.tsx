'use client'
// ──────────────────────────────────────────────────────────
//  Overview — an artist's home: what needs you, the next shows, the next release, money owed, and the contracts that
//  need a look, each with a way into its page. A block only appears when this person may open that part for this artist
//  (lib/artist-overview.ts decides), so the page never shows more than the pages behind it.
// ──────────────────────────────────────────────────────────

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { useInbox } from '@/lib/useInbox'
import { buildOverview, overviewAccessFor } from '@/lib/artist-overview'
import { openInboxItem } from '@/lib/inbox-open'
import { dayWord, plural, whenWord } from '@/lib/roster-summary'
import { today } from '@/lib/utils'
import { Badge } from '@/components/ui/Badge'
import { ArtistAvatar } from '@/components/ui/ArtistAvatar'
import { SetupChecklist } from '@/components/calendar/SetupChecklist'

const CARD = 'glass bg-canvas border border-gray-100 rounded-2xl p-4 md:p-5 flex flex-col'
const LABEL = 'text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2'
const LINK = 'mt-auto pt-3 self-start text-xs font-medium text-accent hover:underline'
const ROW = 'flex w-full items-start gap-3 py-1.5 text-left rounded-lg hover:bg-gray-50 transition-colors'
const DOT = { urgent: 'bg-red-500', soon: 'bg-amber-400', info: 'bg-gray-300' } as const

function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <span className="block mt-2">
      <span className="flex justify-between text-[11px] text-gray-500"><span>{label}</span><span className="tabular-nums">{done} of {total}</span></span>
      <span className="mt-1 block h-1.5 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} /></span>
    </span>
  )
}

export function OverviewView() {
  const client = useStore(s => s.getClient())
  const hasAccess = useStore(s => s.hasAccess)
  const isShareOnly = useStore(s => s.isShareOnly)
  const grants = useStore(s => s.grants)
  const { setSection, setSelectedShow, setSelectedAlbum, setTourSub, setBizSub, setLegalSub } = useStore()
  const inbox = useInbox()
  const id = client?.id

  const day = today()
  const data = useMemo(() => {
    void grants   // a change in what this person may open re-runs this
    if (!client) return null
    // Someone who was only sent one item loads just that item, so a total worked out from it would mislead: that counts as no access.
    return buildOverview(client, day, overviewAccessFor(hasAccess, isShareOnly, client.id))
  }, [client, hasAccess, isShareOnly, grants, day])

  if (!client || !data) return null
  const t = day
  const alerts = inbox.visible.filter(i => i.clientId === id && i.severity !== 'info').slice(0, 5)
  const alertCount = inbox.byClient[client.id] ? inbox.byClient[client.id].urgent + inbox.byClient[client.id].soon : 0
  const canProfile = hasAccess('profile', client.id)
  const showsVisible = hasAccess('tour', client.id) && !isShareOnly('tour', client.id)
  const empty = !data.tour && !data.music && !data.finance && !data.legal

  // setSection() clears the selected show, so it runs before the selection setters.
  const openShow = (showId: string) => { setSection('tour'); setSelectedShow(showId); setTourSub('advance') }
  const openRelease = (albumId: string) => { setSection('songs'); setSelectedAlbum(albumId) }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-6">
        <ArtistAvatar client={client} className="w-14 h-14" textClass="text-lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-[26px] font-medium leading-tight truncate">{client.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {client.genre}
            {client.isDemo && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold uppercase tracking-wide">Demo · only you</span>}
          </p>
        </div>
        {canProfile && (
          <button onClick={() => setSection('profile')} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">Profile →</button>
        )}
      </div>

      {/* "Getting started" for a manager, until every step is done or skipped (it used to open on the Calendar) */}
      <SetupChecklist client={client} className="mb-4" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* What needs you */}
        <section className={`${CARD} lg:col-span-2`} aria-label="Needs you">
          <div className={LABEL}>Needs you{alertCount > 0 && <span className="font-medium tracking-normal normal-case text-gray-300"> · {alertCount}</span>}</div>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-400">Nothing needs you right now.</p>
          ) : (
            alerts.map(a => (
              <button key={a.key} onClick={() => openInboxItem(a)} className={ROW}>
                <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${DOT[a.severity]}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{a.title}</span>
                  {a.detail && <span className="block text-xs text-gray-400">{a.detail}</span>}
                </span>
              </button>
            ))
          )}
          <button onClick={() => setSection('today')} className={LINK}>Open Today →</button>
        </section>

        {data.tour && (
          <section className={CARD} aria-label="Next shows">
            <div className={LABEL}>Next shows</div>
            {data.tour.shows.length === 0 ? (
              <p className="text-sm text-gray-400">{showsVisible ? 'No shows ahead.' : 'You can see this artist\'s offers here, not their shows.'}</p>
            ) : (
              data.tour.shows.map(s => (
                <button key={s.id} onClick={() => openShow(s.id)} className={ROW}>
                  <span className="w-14 flex-shrink-0 text-sm font-semibold tabular-nums">{dayWord(s.date)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{s.city || s.venue}</span>
                    <span className="block text-xs text-gray-400 truncate">{[s.city ? s.venue : '', whenWord(s.date, t)].filter(Boolean).join(' · ')}</span>
                  </span>
                  {s.status === 'hold' && <Badge variant="amber">Hold</Badge>}
                </button>
              ))
            )}
            {data.tour.more > 0 && <p className="text-xs text-gray-400 mt-1">+ {data.tour.more} more after these</p>}
            {data.tour.openOffers !== undefined && data.tour.openOffers > 0 && (
              <button onClick={() => { setSection('tour'); setTourSub('offers') }} className="mt-2 self-start"><Badge variant="blue">{plural(data.tour.openOffers, 'offer')} waiting</Badge></button>
            )}
            <button onClick={() => { setSection('tour'); setTourSub(showsVisible ? 'tour' : 'offers') }} className={LINK}>{showsVisible ? 'All shows →' : 'Open offers →'}</button>
          </section>
        )}

        {data.music && (
          <section className={CARD} aria-label="Next release">
            <div className={LABEL}>Next release</div>
            {data.music.release ? (
              <button onClick={() => openRelease(data.music!.release!.id)} className="block w-full text-left rounded-lg hover:bg-gray-50 transition-colors">
                <span className="block text-sm font-medium">{data.music.release.title}</span>
                <span className="block text-xs text-gray-400">{dayWord(data.music.release.date)} · {whenWord(data.music.release.date, t)}</span>
                {data.music.release.songsTotal > 0 && <Progress done={data.music.release.songsDone} total={data.music.release.songsTotal} label="Songs finished" />}
                {data.music.release.stepsTotal > 0 && <Progress done={data.music.release.stepsDone} total={data.music.release.stepsTotal} label="Release steps done" />}
              </button>
            ) : (
              <p className="text-sm text-gray-400">{data.music.unfinished > 0 ? `No release date set · ${plural(data.music.unfinished, 'song')} not finished` : 'No release coming up.'}</p>
            )}
            <button onClick={() => setSection('songs')} className={LINK}>Open Music →</button>
          </section>
        )}

        {data.finance && (
          <section className={CARD} aria-label="Money owed">
            <div className={LABEL}>Money owed</div>
            {data.finance.owed ? (
              <>
                <div className="font-serif text-xl font-semibold leading-tight">{data.finance.owed}</div>
                <div className={`text-xs mt-0.5 ${data.finance.overdue > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                  {data.finance.overdue > 0 ? `${plural(data.finance.overdue, 'invoice')} overdue` : plural(data.finance.open, 'open invoice')}
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-400">Nothing owed.</p>
            )}
            <button onClick={() => { setSection('finance'); setBizSub('invoices') }} className={LINK}>Open invoices →</button>
          </section>
        )}

        {data.legal && (
          <section className={CARD} aria-label="Contracts">
            <div className={LABEL}>Contracts</div>
            {data.legal.total === 0 ? (
              <p className="text-sm text-gray-400">No contracts yet.</p>
            ) : data.legal.needing === 0 ? (
              <p className="text-sm text-gray-400">All clear · {plural(data.legal.total, 'contract')}</p>
            ) : (
              <>
                <div className="text-sm font-medium mb-1">{plural(data.legal.needing, 'contract')} need{data.legal.needing === 1 ? 's' : ''} a look</div>
                {data.legal.items.map(c => (
                  <button key={c.id} onClick={() => { setSection('legal'); setLegalSub('alerts') }} className={ROW}>
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${c.tone === 'late' ? 'bg-red-500' : 'bg-amber-400'}`} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium truncate">{c.title}</span>
                      <span className="block text-xs text-gray-400">{c.line}</span>
                    </span>
                  </button>
                ))}
              </>
            )}
            <button onClick={() => setSection('legal')} className={LINK}>Open Legal →</button>
          </section>
        )}
      </div>

      {empty && alerts.length === 0 && (
        <p className="mt-6 text-sm text-gray-400">There is nothing to summarise here yet. Use the pages on the left for what you can open for {client.name}.</p>
      )}
    </div>
  )
}
