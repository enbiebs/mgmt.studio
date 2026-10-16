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
  addClient: (name: string, genre: string, color: string, forWorkspaceId?: string) => void
  updateClient: (id: string, name: string, genre: string, color: string) => void
}) {
  const existing = useStore(s => clientId ? s.getClient(clientId) : undefined)
  const [name,  setName]  = useState(existing?.name  ?? '')
  const [genre, setGenre] = useState(existing?.genre ?? '')
  const [color, setColor] = useState(existing?.color ?? AVATAR_COLORS[0])
  // A person who manages more than one company chooses which one the new artist belongs to.
  const contexts = useStore(s => s.contexts)
  const openWorkspace = useStore(s => s.workspaceId)
  const preferred = useStore(s => s.modalData.workspaceId) as string | undefined   // the "+ Add a client" tile of a company pre-selects it
  const managed = Object.values(contexts).filter(c => c.role === 'manager')
  const [company, setCompany] = useState(managed.find(c => c.workspaceId === (preferred ?? openWorkspace))?.workspaceId ?? managed[0]?.workspaceId ?? '')

  function save() {
    if (!name.trim()) return
    if (mode === 'edit' && clientId) updateClient(clientId, name.trim(), genre.trim(), color)
    else addClient(name.trim(), genre.trim(), color, managed.length > 1 ? company : undefined)
    onClose()
  }

  return (
    <Modal
      title={mode === 'edit' ? 'Edit client' : 'Add a client'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={save}    className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors">
            {mode === 'edit' ? 'Save' : 'Add client'}
          </button>
        </>
      }
    >
      {mode === 'add' && managed.length > 1 && (
        <FormField label="Company">
          <select className={inputClass} value={company} onChange={e => setCompany(e.target.value)} aria-label="Company">
            {managed.map(c => <option key={c.workspaceId} value={c.workspaceId}>{c.companyName || 'Your company'}</option>)}
          </select>
        </FormField>
      )}
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
