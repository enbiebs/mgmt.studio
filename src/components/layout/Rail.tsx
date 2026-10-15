'use client'
import { useStore } from '@/lib/store'
import { useInbox } from '@/lib/useInbox'
import { PRODUCT_NAME } from '@/lib/brand'
import { BrandMark, Icon } from '@/components/ui/Icon'
import { ClientSwitcher } from './ClientSwitcher'
import { useVisibleNav } from './nav'
import { ArtistAvatar } from '@/components/ui/ArtistAvatar'

const ITEM = 'flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-sm font-medium text-left transition-colors'
const ITEM_ON = 'bg-canvas text-gray-900 shadow-[0_0_0_1px_var(--color-gray-100)]'
const ITEM_OFF = 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'

/** The side rail: where you are, and the way to everywhere else. Hidden on phones, where the top bar carries the same links. */
export function Rail() {
  const view = useStore(s => s.view)
  const section = useStore(s => s.section)
  const clientId = useStore(s => s.clientId)
  const data = useStore(s => s.data)
  const accessibleClientIds = useStore(s => s.accessibleClientIds)
  const goToDashboard = useStore(s => s.goToDashboard)
  const goToCompany = useStore(s => s.goToCompany)
  const isManager = useStore(s => s.role === 'manager')
  const openClient = useStore(s => s.openClient)
  const setSection = useStore(s => s.setSection)
  const inbox = useInbox().total
  const groups = useVisibleNav()

  const inClient = view === 'studio' && !!clientId
  const ids = accessibleClientIds()
  const roster = ids === 'all' ? data.clients : data.clients.filter(c => ids.includes(c.id))

  return (
    <aside aria-label="Main" className="hidden md:flex w-[232px] flex-shrink-0 flex-col gap-1 border-r border-gray-100 bg-gray-50 px-3 py-4 overflow-y-auto">
      <div className="flex items-center gap-2 px-2 pb-3 font-serif font-semibold text-[17px]">
        <BrandMark /> {PRODUCT_NAME}
      </div>

      <button
        onClick={goToDashboard}
        aria-current={!inClient && view !== 'company' ? 'page' : undefined}
        className={`${ITEM} ${!inClient && view !== 'company' ? ITEM_ON : ITEM_OFF}`}
      >
        <Icon name="home" /> Home
        {inbox > 0 && <span className="ml-auto px-1.5 rounded-full bg-accent text-white text-[10px] font-semibold leading-4">{inbox}</span>}
      </button>

      {isManager && (
        <button
          onClick={goToCompany}
          aria-current={view === 'company' ? 'page' : undefined}
          className={`${ITEM} ${view === 'company' ? ITEM_ON : ITEM_OFF}`}
        >
          <Icon name="team" /> Company
        </button>
      )}

      {inClient ? (
        <>
          <div className="mt-3 mb-1"><ClientSwitcher variant="rail" /></div>
          {groups.map(g => (
            <div key={g.label} className="mt-2">
              <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">{g.label}</div>
              {g.items.map(i => (
                <button
                  key={i.key}
                  onClick={() => setSection(i.key)}
                  aria-current={section === i.key ? 'page' : undefined}
                  className={`${ITEM} ${section === i.key ? ITEM_ON : ITEM_OFF}`}
                >
                  <Icon name={i.icon} /> {i.label}
                </button>
              ))}
            </div>
          ))}
        </>
      ) : (
        roster.length > 0 && (
          <div className="mt-3">
            <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400">Artists</div>
            {roster.map(c => (
              <button key={c.id} onClick={() => openClient(c.id)} className={`${ITEM} ${ITEM_OFF}`}>
                <ArtistAvatar client={c} className="w-[18px] h-[18px]" textClass="text-[8px]" />
                <span className="truncate">{c.name}</span>
                {c.isDemo && <span className="ml-auto text-[9px] font-semibold uppercase text-amber-700">Demo</span>}
              </button>
            ))}
          </div>
        )
      )}

      <div className="flex-1" />
      <div className="px-2.5 pt-3 text-[10px] uppercase tracking-widest text-gray-400">Music management · v0.1</div>
    </aside>
  )
}
