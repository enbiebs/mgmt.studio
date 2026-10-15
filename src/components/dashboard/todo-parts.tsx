'use client'
// Small pieces shared by the Today list and the per-item to-do window.

import { useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { describeLink, dueLabel, peopleFor, taskDestination, taskSection } from '@/lib/tasks'
import { useMe } from '@/lib/useToday'
import { today } from '@/lib/utils'
import { AgendaButton, AgendaPanel } from './AgendaPanel'
import type { BizSub, Task, TourSub } from '@/types'

/**
 * "Given to": the real people on the team who can open this artist (you first, shown as "Me").
 * If the person it is given to can no longer be listed (they lost access), they are still shown.
 */
export function AssigneeSelect({ clientId, value, onChange, disabled, className, noneLabel = 'Nobody yet' }: {
  clientId: string; value?: string; onChange: (userId: string | null) => void
  disabled?: boolean; className?: string; noneLabel?: string
}) {
  const people = useStore(s => s.workspacePeople)
  const me = useMe()
  const listed = peopleFor(people, clientId, me)
  const options = value && !listed.some(p => p.userId === value)
    ? [...listed, { userId: value, label: people.find(p => p.userId === value)?.label ?? 'Someone' }]
    : me && !listed.some(p => p.userId === me) ? [{ userId: me, label: 'Me' }, ...listed] : listed
  return (
    <select aria-label="Given to" disabled={disabled} value={value ?? ''} onChange={e => onChange(e.target.value || null)} className={className}>
      <option value="">{noneLabel}</option>
      {options.map(p => <option key={p.userId} value={p.userId}>{p.userId === me ? 'Me' : p.label}</option>)}
    </select>
  )
}

/** A due date that reads as text ("Fri", "Oct 30", red when late) and opens the browser's date picker when clicked. */
export function DueButton({ value, late, disabled, onChange }: { value?: string; late: boolean; disabled: boolean; onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  function pick() {
    const el = ref.current
    if (!el) return
    try { if (el.showPicker) { el.showPicker(); return } } catch { /* some browsers only allow it from a click on the field itself */ }
    el.focus(); el.click()
  }
  return (
    <span className="relative inline-flex">
      <button
        type="button" disabled={disabled} onClick={pick}
        className={`px-2 py-1 text-xs rounded-lg disabled:cursor-default ${value ? (late ? 'text-red-600 font-semibold' : 'text-gray-500') : 'text-gray-300'} ${disabled ? '' : 'hover:bg-gray-50'}`}
        title={value ? 'Change the date' : 'Add a date'}
      >
        {value ? dueLabel(value, today()) : 'Add date'}
      </button>
      <input
        ref={ref} type="date" tabIndex={-1} aria-label="Due date" value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="absolute inset-0 opacity-0 pointer-events-none"
      />
    </span>
  )
}

export const ROW_INNER = 'flex flex-wrap md:flex-nowrap items-start gap-x-3 gap-y-1.5 py-2.5'
export const ROW = `${ROW_INNER} border-t border-gray-50 first:border-t-0`
export const ChipName = ({ name }: { name: string }) => <span className="text-[11px] font-semibold text-gray-400 mr-1.5">{name}</span>

// ── A to-do somebody wrote down ───────────────────────────────────────────────

export function TaskRow({ task, clientId, clientName, me }: { task: Task; clientId: string; clientName: string; me: string | null }) {
  const { toggleTask, updateTask, deleteTask } = useStore()
  const people = useStore(s => s.workspacePeople)
  const hasAccess = useStore(s => s.hasAccess)
  const about = useStore(s => {
    const c = s.data.clients.find(x => x.id === clientId)
    return c && task.link ? describeLink(c, task.link) : undefined
  })
  const [agendaOpen, setAgendaOpen] = useState(false)
  const day = today()
  const late = !!task.dueDate && task.dueDate < day
  const mayChange = task.assigneeId === me || hasAccess(taskSection(task.link), clientId, true)
  const options = peopleFor(people, clientId, me)
  // If the person it is given to can no longer be listed (they lost access), keep showing them.
  const given = task.assigneeId && !options.some(p => p.userId === task.assigneeId)
    ? [...options, { userId: task.assigneeId, label: people.find(p => p.userId === task.assigneeId)?.label ?? 'Someone' }]
    : options

  function open() {
    if (!task.link) return
    const to = taskDestination(task.link)
    const s = useStore.getState()
    s.openClient(clientId)
    s.setSection(to.section)
    if (to.section === 'tour' && to.sub) s.setTourSub(to.sub as TourSub)
    if (to.section === 'finance' && to.sub) s.setBizSub(to.sub as BizSub)
    if (to.showId) s.setSelectedShow(to.showId)
  }

  return (
    <div className="border-t border-gray-50 first:border-t-0">
    <div className={ROW_INNER}>
      <button
        role="checkbox" aria-checked={false} aria-label={`Mark “${task.title}” done`}
        disabled={!mayChange} onClick={() => toggleTask(clientId, task.id)}
        className="mt-0.5 w-[18px] h-[18px] rounded-full border-[1.5px] border-gray-300 hover:border-accent hover:bg-accent-soft disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:bg-transparent flex-shrink-0 transition-colors"
      />
      <div className="flex-1 min-w-0 basis-[calc(100%-2rem)] md:basis-auto">
        <div className="text-sm"><ChipName name={clientName} /><span className="font-medium break-words">{task.title}</span></div>
        {about && <div className="text-xs text-gray-400 mt-0.5 break-words">About {about}</div>}
        {task.notes && <div className="text-xs text-gray-400 mt-0.5 break-words">{task.notes}</div>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto md:ml-0">
        <DueButton value={task.dueDate} late={late} disabled={!mayChange} onChange={v => updateTask(clientId, task.id, { dueDate: v })} />
        <select
          aria-label="Given to" disabled={!mayChange} value={task.assigneeId ?? ''}
          onChange={e => updateTask(clientId, task.id, { assigneeId: e.target.value || null })}
          className="px-1 py-1 text-xs text-gray-400 bg-transparent border-0 cursor-pointer hover:text-gray-700 max-w-[110px] truncate disabled:cursor-default"
        >
          <option value="">Nobody yet</option>
          {given.map(p => <option key={p.userId} value={p.userId}>{p.userId === me ? 'Me' : p.label}</option>)}
        </select>
        <AgendaButton clientId={clientId} itemType="task" itemId={task.id} open={agendaOpen} onToggle={() => setAgendaOpen(v => !v)} />
        {task.link && <button onClick={open} className="px-2 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">Open</button>}
        {mayChange && (
          <button
            aria-label={`Remove “${task.title}”`} title="Remove"
            onClick={() => { if (confirm(`Remove this to-do?\n\n${task.title}`)) deleteTask(clientId, task.id) }}
            className="px-1.5 py-1 text-sm leading-none text-gray-300 hover:text-red-500"
          >
            ×
          </button>
        )}
      </div>
    </div>
    {agendaOpen && <div className="pl-[30px]"><AgendaPanel clientId={clientId} itemType="task" itemId={task.id} canEdit={mayChange} /></div>}
    </div>
  )
}
