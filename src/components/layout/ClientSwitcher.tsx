'use client'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { initials, today } from '@/lib/utils'
import { Icon } from '@/components/ui/Icon'
import { useDismiss } from './useDismiss'

/** Which artist you're working on, and a quick way to move to another. `rail` is the roomy card in the side rail; `compact` is the phone pill. */
export function ClientSwitcher({ variant }: { variant: 'rail' | 'compact' }) {
  const client = useStore(s => s.getClient())
  const data = useStore(s => s.data)
  const accessibleClientIds = useStore(s => s.accessibleClientIds)
  const openClient = useStore(s => s.openClient)
  const goToDashboard = useStore(s => s.goToDashboard)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  const ids = accessibleClientIds()
  const roster = ids === 'all' ? data.clients : data.clients.filter(c => ids.includes(c.id))

  const subtitle = useMemo(() => {
    if (!client) return ''
    const t = today()
    const upcoming = client.tour.shows.filter(s => s.date >= t && s.status !== 'cancelled' && !s.historyOnly).length
    const openOffers = (client.agentData?.offers ?? []).filter(o => o.status === 'inquiry' || o.status === 'hold').length
    const parts = [`${upcoming} upcoming`]
    if (openOffers > 0) parts.push(`${openOffers} offer${openOffers === 1 ? '' : 's'}`)
    return parts.join(' · ')
  }, [client])

  if (!client) return null
  const rail = variant === 'rail'

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={rail
          ? 'flex items-center gap-2.5 w-full text-left p-2 rounded-xl border border-gray-100 bg-canvas hover:border-gray-200 transition-colors'
          : 'flex items-center gap-2 px-2.5 py-1 rounded-full bg-gray-50 border border-gray-200 text-sm font-medium hover:bg-gray-100 transition-colors'}
      >
        <span
          className={`rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ${rail ? 'w-8 h-8 text-[11px]' : 'w-5 h-5 text-[9px]'}`}
          style={{ background: client.color }}
        >
          {initials(client.name)}
        </span>
        {rail ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium leading-tight truncate">{client.name}</span>
              <span className="block text-[11px] text-gray-500 truncate">{subtitle}</span>
            </span>
            <Icon name="chevron" className="w-4 h-4 text-gray-400" />
          </>
        ) : (
          <span className="max-w-[110px] truncate">{client.name}</span>
        )}
      </button>

      {open && (
        <div role="listbox" className="absolute left-0 top-full mt-1 min-w-full w-max max-w-[260px] bg-canvas border border-gray-100 rounded-xl shadow-lg max-h-[60vh] overflow-y-auto z-50 py-1">
          <button
            onClick={() => { goToDashboard(); setOpen(false) }}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-gray-500 hover:bg-gray-50 transition-colors"
          >
            <Icon name="home" className="w-4 h-4" /> All clients
          </button>
          <div className="h-px bg-gray-100 my-1" />
          {roster.map(c => (
            <button
              key={c.id}
              role="option"
              aria-selected={c.id === client.id}
              onClick={() => { openClient(c.id); setOpen(false) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.color }} />
              <span className={`truncate ${c.id === client.id ? 'font-semibold' : ''}`}>{c.name}</span>
              {c.isDemo && <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-50 rounded-full px-1.5">Demo</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
