'use client'
// ──────────────────────────────────────────────────────────
//  ArtistPicker — the "All artists" Music, Finance and Legal pages (for now): one row per artist with
//  the one number that matters on that page, and a click to open that artist's own page. (The numbers come
//  from lib/roster-summary.ts, so they always agree with the artist's page they open.)
// ──────────────────────────────────────────────────────────

import { useStore } from '@/lib/store'
import { summarize, type ArtistSummary, type SummaryPage, type SummaryTone } from '@/lib/roster-summary'
import { pickerNote } from '@/lib/nav-map'
import { today } from '@/lib/utils'
import { ArtistAvatar } from '@/components/ui/ArtistAvatar'
import { useArtistsFor } from '@/components/layout/nav'

const COPY: Record<SummaryPage, { title: string; blurb: string; empty: string }> = {
  music:   { title: 'Music',   blurb: 'The next release for each artist. Pick an artist to open their music.',     empty: 'No artists with a music page you can open yet.' },
  finance: { title: 'Finance', blurb: 'What each artist is still owed. Pick an artist to open their finances.',    empty: 'No artists with a finance page you can open yet.' },
  legal:   { title: 'Legal',   blurb: 'Contracts that need a look. Pick an artist to open their contracts.',       empty: 'No artists with a legal page you can open yet.' },
}

const DOT: Record<SummaryTone, string> = { ok: 'bg-green-500', todo: 'bg-amber-400', late: 'bg-red-500', quiet: 'bg-gray-300' }
const TONE_WORD: Record<SummaryTone, string> = { ok: 'On track', todo: 'To do', late: 'Needs attention', quiet: 'Nothing yet' }

export function ArtistPicker({ page }: { page: SummaryPage }) {
  const artists = useArtistsFor(page)
  const switchScope = useStore(s => s.switchScope)
  const isShareOnly = useStore(s => s.isShareOnly)
  const copy = COPY[page]
  const t = today()

  return (
    <>
      <div className="mb-5">
        <h1 className="font-serif text-[26px] font-medium leading-tight">{copy.title}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{artists.length > 0 ? copy.blurb : copy.empty}</p>
      </div>

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(340px,100%),1fr))] gap-3">
        {artists.map(c => {
          const note = pickerNote(page, c.id, { shareOnly: (sec, id) => isShareOnly(sec, id) })
          const s: ArtistSummary = note ? { headline: note, tone: 'quiet' } : summarize(page, c, t)
          return (
            <li key={c.id}>
              <button
                onClick={() => switchScope(c.id)}
                className="glass w-full flex items-center gap-3 text-left p-3.5 bg-canvas border border-gray-100 rounded-2xl hover:border-gray-200 transition-colors"
              >
                <ArtistAvatar client={c} className="w-10 h-10" textClass="text-xs" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">{c.name}</span>
                    {c.isDemo && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 rounded-full px-1.5">Demo</span>}
                  </span>
                  <span className="block text-sm text-gray-700 truncate">{s.headline}</span>
                  {s.detail && <span className="block text-xs text-gray-400 truncate">{s.detail}</span>}
                </span>
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${DOT[s.tone]}`} title={TONE_WORD[s.tone]} role="img" aria-label={TONE_WORD[s.tone]} />
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
