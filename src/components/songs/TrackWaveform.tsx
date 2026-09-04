'use client'
import { useEffect, useRef, useState } from 'react'
import type WaveSurferType from 'wavesurfer.js'
import type { TrackNote } from '@/types'

function fmtTime(s: number): string {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}

// Numbered pins above the waveform mark where notes were left — matches
// the reference design, and doubles as a click-to-seek shortcut.
export function TrackWaveform({ audioUrl, notes, onAddNoteAt }: {
  audioUrl: string | null
  notes: TrackNote[]
  onAddNoteAt: (seconds: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurferType | null>(null)
  const [ready, setReady] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!audioUrl || !containerRef.current) return
    const url = audioUrl
    let cancelled = false
    setReady(false)

    async function init() {
      const [{ default: WaveSurfer }, { default: RegionsPlugin }] = await Promise.all([
        import('wavesurfer.js'),
        import('wavesurfer.js/plugins/regions'),
      ])
      if (cancelled || !containerRef.current) return

      const regions = RegionsPlugin.create()
      const ws = WaveSurfer.create({
        container: containerRef.current,
        waveColor: '#d1d5db',
        progressColor: '#93c5fd',
        cursorColor: '#111827',
        height: 64,
        barWidth: 2,
        barGap: 1,
        barRadius: 2,
        normalize: true,
        url,
        plugins: [regions],
      })
      wsRef.current = ws

      ws.on('ready', (dur) => {
        if (cancelled) return
        setReady(true)
        setDuration(dur)
        notes.forEach((n, i) => {
          const badge = document.createElement('div')
          badge.textContent = String(i + 1)
          badge.style.cssText = 'width:16px;height:16px;border-radius:9999px;background:#3b82f6;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;transform:translateY(-20px);cursor:pointer;'
          regions.addRegion({ start: n.timestamp, content: badge, drag: false, resize: false, color: 'transparent' })
        })
      })
      ws.on('timeupdate', (t) => { if (!cancelled) setCurrentTime(t) })
      ws.on('play', () => { if (!cancelled) setPlaying(true) })
      ws.on('pause', () => { if (!cancelled) setPlaying(false) })
      ws.on('finish', () => { if (!cancelled) setPlaying(false) })
      regions.on('region-clicked', (region, e) => {
        e.stopPropagation()
        ws.setTime(region.start)
      })
    }
    init()

    return () => {
      cancelled = true
      wsRef.current?.destroy()
      wsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl])

  if (!audioUrl) {
    return (
      <div className="h-16 flex items-center justify-center text-xs text-gray-300 border border-dashed border-gray-200 rounded-lg">
        No audio uploaded for this round yet
      </div>
    )
  }

  return (
    <div>
      <div ref={containerRef} className="min-h-[64px]" />
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={() => wsRef.current?.playPause()}
          disabled={!ready}
          className="w-7 h-7 flex-shrink-0 rounded-full bg-gray-900 text-canvas flex items-center justify-center text-xs disabled:opacity-30"
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="text-xs text-gray-400 tabular-nums">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
        <button
          onClick={() => onAddNoteAt(currentTime)}
          disabled={!ready}
          className="ml-auto px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors disabled:opacity-30"
        >
          + Note at {fmtTime(currentTime)}
        </button>
      </div>
    </div>
  )
}
