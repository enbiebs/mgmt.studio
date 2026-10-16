'use client'
// ──────────────────────────────────────────────────────────
//  "Set up <company>": the first-day steps for a new company, at the top of Home for its owner and admins. Each step
//  ticks itself when the thing exists and the whole card goes away when everything is done (or when they hide it).
// ──────────────────────────────────────────────────────────
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { companySetupDone, companySteps } from '@/lib/company-setup'

const flagKey = (workspaceId: string | null) => `mp-company-setup-hidden:${workspaceId ?? ''}`
function readHidden(workspaceId: string | null): boolean {
  try { return window.localStorage.getItem(flagKey(workspaceId)) === '1' } catch { return false }
}

export function CompanySetupCard() {
  const isManager = useStore(s => s.role === 'manager' && s.previewMemberId === null)
  const workspaceId = useStore(s => s.workspaceId)
  const companyName = useStore(s => s.companyName)
  const clients = useStore(s => s.data.clients)
  const people = useStore(s => s.workspacePeople)
  const openModal = useStore(s => s.openModal)
  const goToCompany = useStore(s => s.goToCompany)
  const [hidden, setHidden] = useState(() => readHidden(workspaceId))

  if (!isManager || hidden) return null
  const teammates = people
    .filter(p => p.role !== 'manager' && p.role !== 'artist')
    .map(p => ({ allClients: p.allClients, artistCount: p.clientIds.length }))
  const steps = companySteps({ artistCount: clients.filter(c => !c.isDemo).length, teammates })
  if (companySetupDone(steps)) return null
  const doneCount = steps.filter(s => s.done).length

  function hide() {
    setHidden(true)
    try { window.localStorage.setItem(flagKey(workspaceId), '1') } catch { /* a private window: it just comes back next time */ }
  }
  const run = (key: string) => key === 'artist' ? openModal('add-client') : goToCompany()

  return (
    <section aria-label="Set up your company" className="glass mb-6 rounded-2xl border border-gray-100 bg-gray-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-serif text-lg font-medium leading-tight">Set up {companyName || 'your company'}</div>
          <div className="text-xs text-gray-500">{doneCount} of {steps.length} done</div>
        </div>
        <button onClick={hide} className="text-xs font-medium text-gray-400 hover:text-gray-700">Hide</button>
      </div>
      <ol className="flex flex-col gap-2">
        {steps.map(s => (
          <li key={s.key} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-canvas px-3 py-2.5">
            <span aria-hidden="true" className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[11px] ${s.done ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 text-transparent'}`}>✓</span>
            <div className="min-w-0 flex-1 basis-56">
              <div className={`text-sm font-medium ${s.done ? 'text-gray-400 line-through' : ''}`}>{s.title}</div>
              {!s.done && <div className="text-xs text-gray-500">{s.hint}</div>}
            </div>
            {!s.done && (
              <button onClick={() => run(s.key)} className="rounded-lg border border-accent/40 bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent-soft/70">{s.action} →</button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
