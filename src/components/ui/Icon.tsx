// A small set of line icons (24x24, drawn with the current text color).

const PATHS = {
  home:     'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',
  calendar: 'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 2v4M16 2v4',
  tour:     'M2 16l20-8-8 16-3-7z',
  finance:  'M12 2v20M17 6.5C17 5 15 4 12 4S7 5 7 7s2 2.5 5 3 5 1.2 5 3.2-2 3.3-5 3.3-5-1.2-5-2.8',
  legal:    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h6',
  music:    'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  content:  'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21',
  projects: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
  analytics:'M18 20V10M12 20V4M6 20v-6',
  team:     'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  search:   'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  plus:     'M12 5v14M5 12h14',
  chevron:  'M6 9l6 6 6-6',
  arrow:    'M5 12h14M13 6l6 6-6 6',
  check:    'M20 6L9 17l-5-5',
  mark:     'M5 19c4 0 3-14 7-14s3 14 7 14',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, className = 'w-[18px] h-[18px]' }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`flex-shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}

/** The product mark: a small accent tile with a single wave. */
export function BrandMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-lg bg-accent text-white flex-shrink-0 ${className}`}>
      <Icon name="mark" className="w-[15px] h-[15px]" />
    </span>
  )
}
