'use client'
import { useStore } from '@/lib/store'
import { useInbox } from '@/lib/useInbox'
import { PRODUCT_NAME } from '@/lib/brand'
import { ROSTER_PAGE_LABEL } from '@/lib/nav-map'
import { BrandMark, Icon } from '@/components/ui/Icon'
import { ClientSwitcher } from './ClientSwitcher'
import { ROSTER_PAGE_ICON, useVisibleNav, useVisibleRosterPages } from './nav'

const ITEM = 'flex items-center gap-2.5 w-full px-2.5 py-1.5 rounded-lg text-sm font-medium text-left transition-colors'
const ITEM_ON = 'bg-canvas text-gray-900 shadow-[0_0_0_1px_var(--color-gray-100)]'
const ITEM_OFF = 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
const HEADING = 'px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-widest text-gray-400'

function Badge({ n }: { n: number }) {
  return n > 0 ? <span className="ml-auto px-1.5 rounded-full bg-accent text-white text-[10px] font-semibold leading-4">{n}</span> : null
}

/**
 * The sidebar: one artist switcher on top ("All artists" or one artist), then the same pages either way. Picking an artist
 * narrows every page to them. Hidden on phones, where the top bar carries the switcher and the same links.
 */
export function Sidebar() {
  const view = useStore(s => s.view)
  const section = useStore(s => s.section)
  const rosterPage = useStore(s => s.rosterPage)
  const goToRoster = useStore(s => s.goToRoster)
  const goToCompany = useStore(s => s.goToCompany)
  const setSection = useStore(s => s.setSection)
  const isManager = useStore(s => s.role === 'manager')
  const companyName = useStore(s => s.companyName)
  const clientId = useStore(s => s.clientId)
  const inboxAll = useInbox()
  const groups = useVisibleNav()
  const pages = useVisibleRosterPages()

  const inArtist = view === 'studio'
  // The Today badge follows the scope: everything that needs action across all artists, or just this artist's (heads-ups never count).
  const mine = clientId ? inboxAll.byClient[clientId] : undefined
  const inbox = inArtist && clientId ? (mine?.urgent ?? 0) + (mine?.soon ?? 0) : inboxAll.total
  const companyLink = isManager ? (
    <button
      onClick={() => goToCompany()}
      aria-current={view === 'company' ? 'page' : undefined}
      className={`${ITEM} ${view === 'company' ? ITEM_ON : ITEM_OFF}`}
    >
      <Icon name="team" /> All company access
    </button>
  ) : null

  return (
    <aside aria-label="Main" className="glass glass-strong glass-rail hidden md:flex w-[232px] flex-shrink-0 flex-col gap-1 border-r border-gray-100 bg-gray-50 px-3 py-4 overflow-y-auto">
      <div className="px-2 pb-3">
        <div className="flex items-center gap-2 font-serif font-semibold text-[17px]">
          <BrandMark /> {PRODUCT_NAME}
        </div>
        {companyName && <div className="mt-0.5 truncate pl-[26px] text-[11px] font-medium text-gray-400" title={companyName}>{companyName}</div>}
      </div>

      <div className="mb-2"><ClientSwitcher variant="rail" /></div>

      {inArtist ? (
        groups.map(g => (
          <div key={g.label || 'main'} className={g.label ? 'mt-2' : ''}>
            {g.label && <div className={HEADING}>{g.label}</div>}
            {g.items.map(i => (
              <button
                key={i.key}
                onClick={() => setSection(i.key)}
                aria-current={section === i.key ? 'page' : undefined}
                className={`${ITEM} ${section === i.key ? ITEM_ON : ITEM_OFF}`}
              >
                <Icon name={i.icon} /> {i.label}
                {i.key === 'today' && <Badge n={inbox} />}
              </button>
            ))}
            {g.label === 'Company' && companyLink}
          </div>
        ))
      ) : (
        pages.map(p => {
          const on = view === 'dashboard' && rosterPage === p
          return (
            <button
              key={p}
              onClick={() => goToRoster(p)}
              aria-current={on ? 'page' : undefined}
              className={`${ITEM} ${on ? ITEM_ON : ITEM_OFF}`}
            >
              <Icon name={ROSTER_PAGE_ICON[p]} /> {ROSTER_PAGE_LABEL[p]}
              {p === 'today' && <Badge n={inbox} />}
            </button>
          )
        })
      )}

      {/* The whole company's people and access (managers). Inside an artist it joins that artist's Company group. */}
      {(!inArtist || !groups.some(g => g.label === 'Company')) && companyLink && (
        <div className="mt-2">
          <div className={HEADING}>Company</div>
          {companyLink}
        </div>
      )}

      <div className="flex-1" />
      <div className="px-2.5 pt-3 text-[10px] uppercase tracking-widest text-gray-400">Music management · v0.1</div>
    </aside>
  )
}
