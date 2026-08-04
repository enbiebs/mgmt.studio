'use client'
import { useEffect } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
}

export function Modal({ title, onClose, children, footer }: ModalProps) {
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-in fade-in duration-150"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-canvas rounded-2xl shadow-2xl w-[460px] max-w-[92vw] p-6 animate-in slide-in-from-bottom-3 duration-200">
        <h2 className="font-serif text-lg font-medium mb-5">{title}</h2>
        <div className="space-y-3">{children}</div>
        {footer && <div className="flex gap-2 justify-end mt-6">{footer}</div>}
      </div>
    </div>
  )
}

export function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

export const inputClass = 'w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-canvas'
export const selectClass = 'w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-blue-400 bg-canvas'
