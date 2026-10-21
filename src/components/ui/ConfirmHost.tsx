'use client'
import { useEffect, useRef, useState } from 'react'
import { onConfirm, type ConfirmRequest } from '@/lib/confirm'
import { Modal } from '@/components/ui/Modal'

interface Pending { id: number; request: ConfirmRequest; answer: (ok: boolean) => void }
let nextId = 0

/** Draws the "are you sure?" box for askConfirm(). Mounted once, next to the Toaster. */
export function ConfirmHost() {
  const [queue, setQueue] = useState<Pending[]>([])
  // Each question can be answered once, whichever way it is closed (a button, Escape, a click outside).
  const answered = useRef(new Set<number>())

  useEffect(() => onConfirm((request, answer) => setQueue(q => [...q, { id: ++nextId, request, answer }])), [])

  const current = queue[0]
  if (!current) return null

  function settle(ok: boolean) {
    if (answered.current.has(current.id)) return
    answered.current.add(current.id)
    current.answer(ok)
    setQueue(q => q.filter(p => p.id !== current.id))
  }

  const { request } = current
  return (
    <Modal
      key={current.id}
      title={request.title}
      onClose={() => settle(false)}
      footer={
        <>
          <button onClick={() => settle(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={() => settle(true)} className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700">{request.confirmLabel ?? 'Remove'}</button>
        </>
      }
    >
      {request.body && <p className="text-sm text-gray-600">{request.body}</p>}
      {request.items && request.items.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
          {request.items.map(i => <li key={i}>{i}</li>)}
        </ul>
      )}
      <p className="text-xs text-gray-400">{request.note ?? 'This cannot be undone.'}</p>
    </Modal>
  )
}
