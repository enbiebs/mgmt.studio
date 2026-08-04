'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import { AVATAR_COLORS } from '@/lib/utils'
import { cn } from '@/lib/cn'

export function DashboardModals() {
  const { modal, modalData, closeModal, addClient, updateClient } = useStore()

  if (modal === 'add-client' || modal === 'edit-client') {
    return <ClientModal mode={modal === 'edit-client' ? 'edit' : 'add'} clientId={modalData.id as string} onClose={closeModal} addClient={addClient} updateClient={updateClient} />
  }
  return null
}

function ClientModal({ mode, clientId, onClose, addClient, updateClient }: {
  mode: 'add' | 'edit'
  clientId?: string
  onClose: () => void
  addClient: (name: string, genre: string, color: string) => void
  updateClient: (id: string, name: string, genre: string, color: string) => void
}) {
  const existing = useStore(s => clientId ? s.getClient(clientId) : undefined)
  const [name,  setName]  = useState(existing?.name  ?? '')
  const [genre, setGenre] = useState(existing?.genre ?? '')
  const [color, setColor] = useState(existing?.color ?? AVATAR_COLORS[0])

  function save() {
    if (!name.trim()) return
    if (mode === 'edit' && clientId) updateClient(clientId, name.trim(), genre.trim(), color)
    else addClient(name.trim(), genre.trim(), color)
    onClose()
  }

  return (
    <Modal
      title={mode === 'edit' ? 'Edit client' : 'Add a client'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={save}    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors">
            {mode === 'edit' ? 'Save' : 'Add client'}
          </button>
        </>
      }
    >
      <FormField label="Name">
        <input className={inputClass} placeholder="Artist or band name" value={name} onChange={e => setName(e.target.value)} autoFocus />
      </FormField>
      <FormField label="Genre">
        <input className={inputClass} placeholder="e.g. Electronic / House" value={genre} onChange={e => setGenre(e.target.value)} />
      </FormField>
      <FormField label="Color">
        <div className="flex gap-2 flex-wrap">
          {AVATAR_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={cn('w-7 h-7 rounded-full transition-all', color === c ? 'ring-2 ring-offset-1 ring-gray-800' : '')}
              style={{ background: c }}
            />
          ))}
        </div>
      </FormField>
    </Modal>
  )
}
