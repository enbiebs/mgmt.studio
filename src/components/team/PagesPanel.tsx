'use client'
// ──────────────────────────────────────────────────────────
//  The access level and the pages, in one place: a three-way level (View only / View and edit / Point Person) that
//  sets every page they have at once, and one button per page that cycles none -> view -> edit -> none, with the
//  current state written on it. Used by the invite form, the "add someone" form and each person's row.
// ──────────────────────────────────────────────────────────
import { ADMIN_KEY, SECTIONS, overallLevel, type Level, type PageLevels, type SectionKey } from '@/lib/access-presets'

const WORDS: Record<Level, string> = { none: 'None', view: 'View', edit: 'Edit' }
const SCREEN_WORDS: Record<Level, string> = { none: 'no access', view: 'can look', edit: 'can change' }

export function PagesPanel({ levels, pointPerson, onCycle, onSetAll, onPointPerson, disabled = false }: {
  levels: PageLevels
  pointPerson: boolean
  onCycle: (section: SectionKey) => void
  onSetAll: (level: 'view' | 'edit') => void
  onPointPerson: () => void
  disabled?: boolean
}) {
  const overall = overallLevel(levels)
  const active = pointPerson ? ADMIN_KEY : overall
  const seg = (key: string, label: string, hint: string, run: () => void) => (
    <button
      key={key} type="button" onClick={run} disabled={disabled} title={hint} aria-pressed={active === key}
      className={`border-r border-gray-200 px-3 py-1.5 text-xs font-medium transition-colors last:border-r-0 disabled:opacity-50 ${active === key ? 'bg-accent text-white' : 'bg-canvas text-gray-600 hover:bg-gray-50'}`}
    >
      {label}
    </button>
  )

  return (
    <div>
      <div role="group" aria-label="Access level" className="inline-flex overflow-hidden rounded-lg border border-gray-200">
        {seg('view', 'View only', 'Every page they have is look-only', () => onSetAll('view'))}
        {seg('edit', 'View and edit', 'Every page they have can be changed', () => onSetAll('edit'))}
        {seg(ADMIN_KEY, 'Point Person', 'Everything for this artist, and manages who has access', onPointPerson)}
      </div>

      {pointPerson ? (
        <p className="mt-2 text-xs text-gray-500">Every page is included, so there is nothing to pick one by one. The vault (saved passwords and bank details) is never included. To limit them, choose View only or View and edit.</p>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {SECTIONS.map(sec => {
              const level = levels[sec.key] ?? 'none'
              const cls = level === 'edit' ? 'bg-accent text-white' : level === 'view' ? 'bg-blue-50 text-blue-700' : 'border border-gray-100 text-gray-400 hover:bg-gray-50'
              return (
                <button
                  key={sec.key} type="button" onClick={() => onCycle(sec.key)} disabled={disabled}
                  aria-label={`${sec.label}: ${SCREEN_WORDS[level]}`}
                  className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 ${cls}`}
                >
                  <span>{sec.label}</span>
                  <span className="font-semibold">{WORDS[level]}</span>
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-gray-500">Click a page to cycle None, View, Edit.</p>
        </>
      )}
    </div>
  )
}
