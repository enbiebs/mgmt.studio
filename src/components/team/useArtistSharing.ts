'use client'
// ──────────────────────────────────────────────────────────
//  Everything the Team page does about ACCESS for one artist: reading who can open it, changing someone's role or pages,
//  taking them off, cancelling or re-sending an invitation. Managers and this artist's Point People can change it; the
//  database enforces that (migrations 050 and 051), the screen just doesn't offer what would be refused.
//  Each change re-reads what really saved (also when it was refused) and refreshes what depends on it.
// ──────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { ADMIN_KEY, cyclePage, planChanges, presetByKey, setAllPages, type PageLevels, type SectionKey } from '@/lib/access-presets'
import { buildSharingRows, levelChangeWarning, removalWarning, resendWording, type SharingGrant, type SharingRow } from '@/lib/sharing'
import { applyGrantPlan, fetchArtistGrants, revokeArtistAccess } from '@/lib/db'

export type PersonRow = Extract<SharingRow, { kind: 'person' }>
export type Confirm =
  | { memberId: string; kind: 'level'; key: string; text: string }
  | { memberId: string; kind: 'remove'; text: string }
  | { memberId: string; kind: 'cancel'; text: string }

export function useArtistSharing(clientId: string, clientName: string, enabled: boolean) {
  const role = useStore(s => s.role)
  const myMemberId = useStore(s => s.myMemberId)
  const people = useStore(s => s.workspacePeople)
  const previewMembers = useStore(s => s.previewMembers)
  const previewAs = useStore(s => s.previewAs)
  const refreshMyAccess = useStore(s => s.refreshMyAccess)
  const afterAccessChange = useStore(s => s.afterAccessChange)
  const isManager = role === 'manager'

  const [grants, setGrants] = useState<SharingGrant[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<Record<string, string>>({})
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [openPages, setOpenPages] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try { setGrants(await fetchArtistGrants(clientId)); setLoadError(false) } catch (e) { console.error(e); setLoadError(true) }
  }, [clientId])
  // The list is read again whenever the team list changes (someone was just invited, or a change was saved).
  useEffect(() => {
    if (!enabled) return
    let live = true
    fetchArtistGrants(clientId)
      .then(g => { if (live) { setGrants(g); setLoadError(false) } })
      .catch(e => { console.error(e); if (live) setLoadError(true) })
    return () => { live = false }
  }, [clientId, people, enabled])
  // the team list was read when the app opened; someone may have joined since
  useEffect(() => { if (enabled) void afterAccessChange() }, [clientId, enabled, afterAccessChange])

  const rows = useMemo(() => buildSharingRows(people, grants ?? [], clientId), [people, grants, clientId])
  const canPreview = (memberId: string) => isManager && previewMembers.some(m => m.id === memberId)
  const adminIds = (row: PersonRow) => row.grants.filter(g => g.section === ADMIN_KEY).map(g => g.id)

  /** Runs one change for one person, then re-reads what really saved (also when it was refused). */
  async function run(row: PersonRow, task: () => Promise<void>) {
    const id = row.person.memberId
    setBusy(id); setConfirm(null)
    setProblem(p => ({ ...p, [id]: '' })); setNotice(n => ({ ...n, [id]: '' }))
    try {
      await task()
    } catch (e) {
      console.error(e)
      setProblem(p => ({ ...p, [id]: e instanceof Error && e.message && !/not allowed|could not be/i.test(e.message) ? e.message : 'That could not be saved. Please try again.' }))
    } finally {
      try {
        await reload()
        await afterAccessChange(id)
        if (id === myMemberId) {
          await refreshMyAccess()
          // someone who just removed their own access should not be left looking at the artist
          const s = useStore.getState()
          const open = s.accessibleClientIds()
          if (open !== 'all' && !open.includes(clientId)) s.goToDashboard()
        }
      } catch (e) { console.error(e) }
      setBusy(null)
    }
  }

  const commitLevel = (row: PersonRow, key: string) =>
    run(row, () => applyGrantPlan(row.person.memberId, clientId, planChanges(row.grants, clientId, presetByKey(key)?.levels ?? {}, key === ADMIN_KEY), adminIds(row)))

  function chooseLevel(row: PersonRow, key: string) {
    if (busy !== null || key === row.levelKey || key === 'custom') return
    const warning = levelChangeWarning(row.levelKey, key, { isMe: row.person.memberId === myMemberId, isManager })
    if (warning) { setConfirm({ memberId: row.person.memberId, kind: 'level', key, text: warning }); return }
    void commitLevel(row, key)
  }

  function askRemove(row: PersonRow) {
    setConfirm({
      memberId: row.person.memberId, kind: 'remove',
      text: removalWarning({ label: row.person.label, artist: clientName, isMe: row.person.memberId === myMemberId, isManager, alsoCompanyWide: row.alsoCompanyWide }),
    })
  }
  const commitRemove = (row: PersonRow) => run(row, () => revokeArtistAccess(row.person.memberId, clientId))

  function askCancel(row: PersonRow) {
    setConfirm({ memberId: row.person.memberId, kind: 'cancel', text: `Cancel the invitation to ${row.person.label}? Their login and the access set up for them are deleted. Nothing else changes.` })
  }
  const commitCancel = (row: PersonRow) => run(row, async () => {
    const res = await fetch('/api/team/invite/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: row.person.memberId }) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error ?? 'Could not cancel that invitation')
  })

  /** Sends the invitation again (nobody has signed in yet) or a link to set a password (they have). Nothing about their access changes. */
  const resend = (row: PersonRow) => run(row, async () => {
    const res = await fetch('/api/team/invite/resend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId: row.person.memberId }) })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error ?? 'Could not send that again')
    setNotice(n => ({ ...n, [row.person.memberId]: resendWording(!!row.person.invited).sent }))
  })

  function changePages(row: PersonRow, next: PageLevels) {
    if (busy !== null) return
    void run(row, () => applyGrantPlan(row.person.memberId, clientId, planChanges(row.grants, clientId, next), adminIds(row)))
  }
  const cycle = (row: PersonRow, section: SectionKey, levels: PageLevels) => changePages(row, cyclePage(levels, section))
  const setAll = (row: PersonRow, levels: PageLevels, level: 'view' | 'edit') => changePages(row, setAllPages(levels, level))

  return {
    grants, loadError, reload, rows, busy, working: busy !== null, problem, notice, confirm, setConfirm, openPages, setOpenPages,
    isManager, myMemberId, canPreview, previewAs,
    chooseLevel, commitLevel, askRemove, commitRemove, askCancel, commitCancel, resend, cycle, setAll,
  }
}

export type ArtistSharing = ReturnType<typeof useArtistSharing>
