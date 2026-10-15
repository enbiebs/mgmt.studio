'use client'
// ──────────────────────────────────────────────────────────
//  The step after adding a team member: send them an invite. Adding someone and sharing with them are one motion:
//  the person is saved first, then this opens straight away with the role, level, pages and artists to choose. It can
//  be skipped (they stay on the team with "No login yet" and an Invite button), and it opens again from that button.
// ──────────────────────────────────────────────────────────
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal } from '@/components/ui/Modal'
import { InviteForm } from './InviteForm'

export function InviteStepModal({ personId, onClose }: { personId: string; onClose: () => void }) {
  const clientId = useStore(s => s.clientId)
  const person = useStore(s => s.getClient()?.people.find(p => p.id === personId))
  const [sent, setSent] = useState(false)
  if (!person || !clientId) return null

  return (
    <Modal
      wide title={sent ? `Invited ${person.name}` : `Send ${person.name} an invite`} onClose={onClose}
      footer={<button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">{sent ? 'Done' : 'Skip for now'}</button>}
    >
      {!sent && (
        <p className="text-sm text-gray-600">
          {person.name} is on the team{person.title ? ` as ${person.title}` : ''}. The next step is to send them an invite so they can log in.
          Choose what they can see first; it is already set up when they accept.
        </p>
      )}
      <InviteForm person={person} defaultClientId={clientId} onSent={() => setSent(true)} />
    </Modal>
  )
}
