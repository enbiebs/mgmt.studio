'use client'
// ──────────────────────────────────────────────────────────
//  Analytics shared UI primitives
// ──────────────────────────────────────────────────────────

import type { DataPoint } from '@/types'

// ── Number formatters ──────────────────────────────────────
export function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1) + 'K'
  return n.toLocaleString()
}

export function fmtDelta(n: number, showSign = true): string {
  const sign = showSign && n > 0 ? '+' : ''
  return sign + fmtNum(Math.abs(n))
}

export function deltaColor(n: number): string {
  if (n > 0) return 'text-green-600'
  if (n < 0) return 'text-red-500'
  return 'text-gray-400'
}

export function deltaArrow(n: number): string {
  if (n > 0) return '↑'
  if (n < 0) return '↓'
  return '—'
}

// ── Stat card ─────────────────────────────────────────────
interface StatCardProps {
  label: string
  value: string
  delta?: number
  deltaPct?: number
  sub?: string
}

export function StatCard({ label, value, delta, deltaPct, sub }: StatCardProps) {
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className="font-serif text-2xl font-semibold">{value}</div>
      {(delta !== undefined || sub) && (
        <div className="mt-1 flex items-center gap-1.5 flex-wrap">
          {delta !== undefined && (
            <span className={`text-xs font-semibold ${deltaColor(delta)}`}>
              {deltaArrow(delta)} {fmtNum(Math.abs(delta))}{deltaPct !== undefined ? ` (${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''}
            </span>
          )}
          {sub && <span className="text-xs text-gray-400">{sub}</span>}
        </div>
      )}
    </div>
  )
}

// ── Section header ─────────────────────────────────────────
export function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">
      {children}
    </div>
  )
}

// ── Mini sparkline (SVG) ───────────────────────────────────
interface SparklineProps {
  data: DataPoint[]
  color?: string
  height?: number
  width?: number
}

export function Sparkline({ data, color = '#4c8df6', height = 40, width = 120 }: SparklineProps) {
  if (!data || data.length < 2) return <div style={{ width, height }} className="bg-gray-50 rounded" />

  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((d.value - min) / range) * (height - 4) - 2
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const pathD = `M ${pts.join(' L ')}`
  const areaD = `M 0,${height} L ${pts.join(' L ')} L ${width},${height} Z`

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#sg-${color.replace('#', '')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Bar chart (horizontal) ─────────────────────────────────
interface BarChartProps {
  data: { label: string; value: number; pct: number; color?: string }[]
  color?: string
}

export function BarChart({ data, color = '#4c8df6' }: BarChartProps) {
  const max = Math.max(...data.map(d => d.pct), 1)
  return (
    <div className="flex flex-col gap-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="text-xs text-gray-500 w-28 truncate flex-shrink-0">{d.label}</div>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(d.pct / max) * 100}%`, background: d.color ?? color }}
            />
          </div>
          <div className="text-xs font-medium text-gray-600 w-12 text-right flex-shrink-0">
            {d.pct.toFixed(1)}%
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Trend line chart (30-day) ──────────────────────────────
interface TrendChartProps {
  data: DataPoint[]
  color?: string
  label?: string
  height?: number
}

export function TrendChart({ data, color = '#4c8df6', label, height = 120 }: TrendChartProps) {
  if (!data || data.length < 2) return null

  const W = 600
  const H = height
  const values = data.map(d => d.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1

  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * W
    const y = H - ((d.value - min) / range) * (H - 10) - 5
    return { x, y, v: d.value, date: d.date }
  })

  const pathD = `M ${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}`
  const areaD = `M 0,${H} L ${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')} L ${W},${H} Z`

  // Find max point
  const maxPt = pts.reduce((a, b) => b.v > a.v ? b : a)

  return (
    <div>
      {label && <div className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-2">{label}</div>}
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
          <defs>
            <linearGradient id={`tg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaD} fill={`url(#tg-${color.replace('#', '')})`} />
          <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {/* Peak dot */}
          <circle cx={maxPt.x} cy={maxPt.y} r="4" fill={color} />
        </svg>
        {/* Date labels */}
        <div className="flex justify-between mt-1 text-[10px] text-gray-300">
          <span>{data[0]?.date.slice(5)}</span>
          <span>{data[Math.floor(data.length / 2)]?.date.slice(5)}</span>
          <span>{data[data.length - 1]?.date.slice(5)}</span>
        </div>
      </div>
    </div>
  )
}

// ── Movement badge ─────────────────────────────────────────
export function MovementBadge({ movement, amt }: { movement: string; amt: number }) {
  if (movement === 'new') return <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-bold rounded">NEW</span>
  if (movement === 'up')   return <span className="text-green-600 text-xs font-semibold">↑{amt}</span>
  if (movement === 'down') return <span className="text-red-400 text-xs font-semibold">↓{amt}</span>
  return <span className="text-gray-300 text-xs">—</span>
}

// ── Platform color map ─────────────────────────────────────
export const PLATFORM_COLORS: Record<string, string> = {
  Spotify:       '#1DB954',
  'Apple Music': '#FC3C44',
  'YouTube Music': '#FF0000',
  YouTube:       '#FF0000',
  'Amazon Music': '#FF9900',
  Deezer:        '#A238FF',
  TIDAL:         '#00FFFF',
  TikTok:        '#010101',
  Instagram:     '#E1306C',
  Facebook:      '#1877F2',
  X:             '#14171A',
  Shazam:        '#007EF5',
}
