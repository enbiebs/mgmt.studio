'use client'
// ──────────────────────────────────────────────────────────
//  For someone who works under more than one company ("umbrella"):
//    CompanyInvitesCard  invitations from another company, waiting for Accept or Decline (a login that already existed
//                        is never added to a company until it says yes)
//    YourCompaniesCard   the companies they belong to, with Leave (never the owner)
//  Accepting or leaving reloads the app, so every screen starts again from what is now true.
// ──────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useStore } from '@/lib/store'
import { Badge } from '@/components/ui/Badge'
import { acceptCompanyInvite, declineCompanyInvite, leaveCompany, loadMyCompanyInvites, type CompanyInvite } from '@/lib/db'
import { INVITE_ROLE_LABEL } from '@/lib/companies'

export function CompanyInvitesCard() {
  const userId = useStore(s => s.userId)
  const [invites, setInvites] = useState<CompanyInvite[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    if (!userId) return
    let live = true
    loadMyCompanyInvites().then(r => { if (live) setInvites(r) }).catch(console.error)
    return () => { live = false }
  }, [userId])

  async function answer(inv: CompanyInvite, accept: boolean) {
    setBusy(inv.inviteId); setProblem('')
    try {
      if (accept) await acceptCompanyInvite(inv.inviteId)
      else await declineCompanyInvite(inv.inviteId)
      if (accept) { window.location.reload(); return }   // start again from what is now true
      setInvites(list => list.filter(i => i.inviteId !== inv.inviteId))
    } catch (e) {
      console.error(e)
      setProblem(e instanceof Error && e.message ? e.message : 'That could not be saved. Please try again.')
      setInvites(await loadMyCompanyInvites().catch(() => invites))
    } finally { setBusy(null) }
  }

  if (invites.length === 0) return null
  return (
    <section aria-label="Invitations" className="mb-6 rounded-2xl border border-accent/30 bg-accent-soft/40 p-4">
      <div className="mb-2 font-serif text-lg font-medium leading-tight">{invites.length === 1 ? 'You have been invited to join a company' : `You have ${invites.length} invitations`}</div>
      <ul className="flex flex-col gap-2">
        {invites.map(inv => (
          <li key={inv.inviteId} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-canvas px-3 py-2.5">
            <div className="min-w-0 flex-1 basis-60">
              <div className="text-sm font-medium">{inv.company || 'A company'}</div>
              <div className="text-xs text-gray-500">
                As {INVITE_ROLE_LABEL[inv.role] ?? inv.role}{inv.artists.length > 0 ? ` · ${inv.artists.join(', ')}` : ''}. Nothing is shared until you accept.
              </div>
            </div>
            <button onClick={() => void answer(inv, true)} disabled={busy !== null} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Accept</button>
            <button onClick={() => void answer(inv, false)} disabled={busy !== null} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50">Decline</button>
          </li>
        ))}
      </ul>
      {problem && <p role="alert" className="mt-2 text-xs text-red-600">{problem}</p>}
    </section>
  )
}

const ROLE_WORDS: Record<string, string> = { manager: 'Admin', team: 'Team member', agent: 'Agent', lawyer: 'Lawyer', artist: 'Artist' }

export function YourCompaniesCard() {
  const contexts = useStore(s => s.contexts)
  const userId = useStore(s => s.userId)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const list = Object.values(contexts)
  if (list.length < 2) return null

  async function leave(workspaceId: string) {
    setBusy(true); setProblem('')
    try { await leaveCompany(workspaceId); window.location.reload() }
    catch (e) { console.error(e); setProblem(e instanceof Error && e.message ? e.message : 'That could not be saved. Please try again.'); setBusy(false) }
  }

  return (
    <section aria-label="Your companies" className="mb-6 mt-10">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-500">Your companies</div>
      <div className="flex flex-col gap-1.5">
        {list.map(c => {
          const owner = !!userId && c.ownerUserId === userId
          return (
            <div key={c.workspaceId} className="rounded-xl border border-gray-100 px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{c.companyName || 'Company'}</span>
                <Badge variant={owner ? 'blue' : 'gray'}>{owner ? 'Owner' : ROLE_WORDS[c.role] ?? c.role}</Badge>
                {!owner && <button onClick={() => setConfirm(confirm === c.workspaceId ? null : c.workspaceId)} className="ml-auto text-xs font-medium text-gray-500 hover:text-red-600">Leave</button>}
              </div>
              {confirm === c.workspaceId && (
                <div role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  <p>Leave {c.companyName || 'this company'}? You will no longer be able to open any of its artists. Your login and your other companies are not affected, and an admin can invite you again.</p>
                  <div className="mt-2 flex gap-2">
                    <button disabled={busy} onClick={() => void leave(c.workspaceId)} className="rounded-lg bg-accent px-2.5 py-1 font-medium text-white hover:bg-accent-hover disabled:opacity-50">Leave</button>
                    <button onClick={() => setConfirm(null)} className="rounded-lg border border-amber-200 px-2.5 py-1 font-medium hover:bg-amber-100">Stay</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {problem && <p role="alert" className="mt-2 text-xs text-red-600">{problem}</p>}
    </section>
  )
}
