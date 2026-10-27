'use client'
import { useEffect, useRef, useState } from 'react'
import { onNotice, type Notice } from '@/lib/notify'

const SHOW_MS = 8000
/** Long messages (a restore that has several things to say) stay up longer: about as long as it takes to read them. */
const showFor = (text: string) => Math.min(30000, SHOW_MS + Math.max(0, text.length - 100) * 60)

/** Where notify() messages appear: a small dark pill at the bottom of the screen. */
export function Toaster() {
  const [notices, setNotices] = useState<Notice[]>([])
  const timers = useRef(new Map<number, number>())

  useEffect(() => {
    const live = timers.current
    const off = onNotice(n => {
      setNotices(list => [...list.slice(-2), n])
      live.set(n.id, window.setTimeout(() => dismiss(n.id), showFor(n.text)))
    })
    function dismiss(id: number) {
      window.clearTimeout(live.get(id)); live.delete(id)
      setNotices(list => list.filter(x => x.id !== id))
    }
    return () => { off(); live.forEach(t => window.clearTimeout(t)); live.clear() }
  }, [])

  function close(id: number) {
    window.clearTimeout(timers.current.get(id)); timers.current.delete(id)
    setNotices(list => list.filter(x => x.id !== id))
  }

  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-[calc(72px+env(safe-area-inset-bottom))] md:bottom-5 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2 px-4">
      {notices.map(n => (
        <div key={n.id} className="pointer-events-auto flex max-w-[92vw] items-center gap-3 rounded-2xl bg-gray-900 px-4 py-2.5 text-sm text-canvas shadow-lg animate-in fade-in slide-in-from-bottom-3 duration-200">
          <span>{n.text}</span>
          {n.action && (
            <button onClick={() => { n.action?.run(); close(n.id) }} className="flex-shrink-0 font-semibold underline underline-offset-2 hover:opacity-80">
              {n.action.label}
            </button>
          )}
          <button onClick={() => close(n.id)} aria-label="Dismiss" className="flex-shrink-0 opacity-60 hover:opacity-100">×</button>
        </div>
      ))}
    </div>
  )
}
