'use client'
import { useStore } from '@/lib/store'
import { initials } from '@/lib/utils'

const SUBNAV: Record<string, [string, string][]> = {
  songs:    [['Tracks', 'tracks'], ['Label Copy', 'labelcopy'], ['Checklist', 'checklist'], ['Status', 'status']],
  tour:     [['Shows', 'tour'], ['Offers', 'offers'], ['Advance', 'advance'], ['Day Sheet', 'daysheet'], ['Travel', 'travel'], ['Crew', 'crew'], ['Guests', 'guests']],
  content:  [['Manage', 'manage'], ['Studio', 'studio'], ['Lab', 'lab']],
  finance:  [['Royalties', 'royalties'], ['Banking', 'banking'], ['Catalog', 'catalog'], ['P&L', 'pl'], ['Invoices', 'invoices'], ['Payments', 'payments']],
}

export function Subnav() {
  const { section, songsSub, contentSub, bizSub, tourSub, setSongsSub, setContentSub, setBizSub, setTourSub } = useStore()
  const client = useStore(s => s.getClient())
  const subs = SUBNAV[section] ?? []

  function isActive(key: string) {
    if (section === 'songs')    return songsSub === key
    if (section === 'content')  return contentSub === key
    if (section === 'finance')  return bizSub === key
    if (section === 'tour')     return tourSub === key
    return false
  }

  function handleClick(key: string) {
    if (section === 'songs')    setSongsSub(key as typeof songsSub)
    if (section === 'content')  setContentSub(key as typeof contentSub)
    if (section === 'finance')  setBizSub(key as typeof bizSub)
    if (section === 'tour')     setTourSub(key as typeof tourSub)
  }

  if (subs.length === 0) return null

  return (
    <div className="flex-shrink-0 flex items-center gap-0.5 px-4 py-1.5 border-b border-gray-100">
      {subs.map(([label, key]) => (
        <button
          key={key}
          onClick={() => handleClick(key)}
          className={`px-2.5 py-1 rounded-lg text-sm font-medium transition-colors ${
            isActive(key)
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'
          }`}
        >
          {label}
        </button>
      ))}

      {client && (
        <div className="ml-auto flex items-center gap-2">
          <div
            className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-white text-[9px] font-bold"
            style={{ background: client.color }}
          >
            {initials(client.name)}
          </div>
          <span className="text-sm font-medium text-gray-700">{client.name}</span>
        </div>
      )}
    </div>
  )
}
