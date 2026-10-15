'use client'
// ──────────────────────────────────────────────────────────
//  TodayList — the top of Home: everything that needs this person, in one list, grouped by date.
//  Two kinds of rows share it:
//    · to-dos somebody wrote down (check off, give to someone, set a date), and
//    · the automatic "needs you" items (overdue invoices, offers waiting on a reply) with Done / Snooze.
//  "Mine" shows what is given to you; "Everyone" shows the whole team's.
// ──────────────────────────────────────────────────────────

import { useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { useToday, recallScope, rememberScope } from '@/lib/useToday'
import { BUCKET_LABEL, dueLabel, peopleFor, taskDestination, taskSection, type Bucket, type TodoRow } from '@/lib/tasks'
import type { InboxItem, InboxSeverity } from '@/lib/inbox'
import { money2 } from '@/lib/settlement-math'
import { addDays, fromDateStr, today } from '@/lib/utils'
import type { BizSub, Task, TourSub } from '@/types'
import { AddTodo } from './AddTodo'

const DOT: Record<InboxSeverity, string> = { urgent: 'bg-red-500', soon: 'bg-amber-400', info: 'bg-gray-300' }
const SHOW_FIRST = 8
const HEAD: Partial<Record<Bucket, string>> = { overdue: 'text-red-600' }

export function TodayList() {
  const [scope, setScope] = useState<'mine' | 'everyone'>(recallScope)
  const [showDone, setShowDone] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const people = useStore(s => s.workspacePeople)
  const { list, hiddenAuto, me } = useToday(scope)

  const pick = (next: 'mine' | 'everyone') => { setScope(next); rememberScope(next) }

  const day = fromDateStr(today()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  const empty = list.groups.length === 0

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 mb-5">
        <div>
          <h1 className="font-serif text-[26px] font-medium leading-tight">Today</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {day} · {list.needCount === 0 ? 'nothing needs you right now' : `${list.needCount} need${list.needCount === 1 ? 's' : ''} you`}
          </p>
        </div>
        {people.length > 1 && (
          <div role="group" aria-label="Whose list" className="inline-flex p-0.5 bg-gray-100 rounded-lg text-xs font-medium">
            {(['mine', 'everyone'] as const).map(s => (
              <button
                key={s} onClick={() => pick(s)} aria-pressed={scope === s}
                className={`px-3 py-1 rounded-md transition-colors ${scope === s ? 'bg-canvas shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {s === 'mine' ? 'Mine' : 'Everyone'}
              </button>
            ))}
          </div>
        )}
      </div>

      <AddTodo />

      <section className="mb-8 bg-canvas border border-gray-100 rounded-2xl p-4 md:p-5">
        {empty && (
          <div className="py-4 text-sm text-gray-400">
            {scope === 'mine' ? 'Nothing on your list. Add a to-do above, or enjoy the quiet.' : 'Nothing on anyone’s list right now.'}
          </div>
        )}

        {list.groups.map((g, gi) => {
          const all = expanded[g.bucket]
          const shown = all ? g.rows : g.rows.slice(0, SHOW_FIRST)
          // Heads-ups are the least pressing, so they start folded away.
          if (g.bucket === 'info' && !expanded.info_open) {
            return (
              <button key={g.bucket} onClick={() => setExpanded({ ...expanded, info_open: true })} className="block mt-3 text-xs text-accent hover:underline">
                Show {g.rows.length} heads-up{g.rows.length === 1 ? '' : 's'}
              </button>
            )
          }
          return (
            <div key={g.bucket} className={gi === 0 ? '' : 'mt-4'}>
              <div className={`text-[10px] font-bold uppercase tracking-widest mb-0.5 ${HEAD[g.bucket] ?? 'text-gray-400'}`}>
                {BUCKET_LABEL[g.bucket]} <span className="font-medium tracking-normal normal-case text-gray-300">· {g.rows.length}</span>
              </div>
              {shown.map(r => <Row key={r.key} row={r} me={me} />)}
              {g.rows.length > SHOW_FIRST && (
                <button onClick={() => setExpanded({ ...expanded, [g.bucket]: !all })} className="text-xs text-accent hover:underline mt-1">
                  {all ? 'Show fewer' : `Show all ${g.rows.length}`}
                </button>
              )}
            </div>
          )
        })}

        {(list.done.length > 0 || hiddenAuto.length > 0) && (
          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            {list.done.length > 0 && (
              <button onClick={() => setShowDone(v => !v)} className="hover:text-gray-600">
                {showDone ? 'Hide' : 'Show'} what you finished recently ({list.done.length})
              </button>
            )}
            {hiddenAuto.length > 0 && (
              <button onClick={() => setShowHidden(v => !v)} className="hover:text-gray-600">
                {showHidden ? 'Hide' : 'Show'} done &amp; snoozed alerts ({hiddenAuto.length})
              </button>
            )}
          </div>
        )}
        {showDone && list.done.map(d => <DoneRow key={d.task.id} task={d.task} clientId={d.clientId} clientName={d.clientName} />)}
        {showHidden && hiddenAuto.map(i => <AutoRow key={i.key} item={i} hiddenRow />)}
      </section>
    </>
  )
}

function Row({ row, me }: { row: TodoRow; me: string | null }) {
  return row.kind === 'task'
    ? <TaskRow task={row.task} clientId={row.clientId} clientName={row.clientName} me={me} />
    : <AutoRow item={row.item} />
}

const ROW = 'flex flex-wrap md:flex-nowrap items-start gap-x-3 gap-y-1.5 py-2.5 border-t border-gray-50 first:border-t-0'
const ChipName = ({ name }: { name: string }) => <span className="text-[11px] font-semibold text-gray-400 mr-1.5">{name}</span>

// ── A to-do somebody wrote down ───────────────────────────────────────────────

function TaskRow({ task, clientId, clientName, me }: { task: Task; clientId: string; clientName: string; me: string | null }) {
  const { toggleTask, updateTask, deleteTask } = useStore()
  const people = useStore(s => s.workspacePeople)
  const hasAccess = useStore(s => s.hasAccess)
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
    <div className={ROW}>
      <button
        role="checkbox" aria-checked={false} aria-label={`Mark “${task.title}” done`}
        disabled={!mayChange} onClick={() => toggleTask(clientId, task.id)}
        className="mt-0.5 w-[18px] h-[18px] rounded-full border-[1.5px] border-gray-300 hover:border-accent hover:bg-accent-soft disabled:opacity-40 disabled:hover:border-gray-300 disabled:hover:bg-transparent flex-shrink-0 transition-colors"
      />
      <div className="flex-1 min-w-0 basis-[calc(100%-2rem)] md:basis-auto">
        <div className="text-sm"><ChipName name={clientName} /><span className="font-medium break-words">{task.title}</span></div>
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
  )
}

function DueButton({ value, late, disabled, onChange }: { value?: string; late: boolean; disabled: boolean; onChange: (v: string | null) => void }) {
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

function DoneRow({ task, clientId, clientName }: { task: Task; clientId: string; clientName: string }) {
  const toggleTask = useStore(s => s.toggleTask)
  return (
    <div className={`${ROW} items-center opacity-70`}>
      <span className="w-[18px] h-[18px] rounded-full bg-gray-300 text-white flex items-center justify-center text-[10px] flex-shrink-0">✓</span>
      <div className="flex-1 min-w-0 text-sm text-gray-400 line-through decoration-gray-300"><ChipName name={clientName} />{task.title}</div>
      <button onClick={() => toggleTask(clientId, task.id)} className="px-2 py-1 text-xs text-accent hover:underline">Undo</button>
    </div>
  )
}

// ── The automatic "needs you" items ───────────────────────────────────────────

function AutoRow({ item, hiddenRow = false }: { item: InboxItem; hiddenRow?: boolean }) {
  const { openClient, setSection, setBizSub, setTourSub, markInboxDone, snoozeInboxItem, restoreInboxItem } = useStore()

  function open() {
    openClient(item.clientId)
    setSection(item.go.section)
    if (item.go.section === 'finance' && item.go.sub) setBizSub(item.go.sub as BizSub)
    if (item.go.section === 'tour' && item.go.sub) setTourSub(item.go.sub as TourSub)
  }

  return (
    <div className={ROW}>
      <div className={`w-2 h-2 rounded-full mt-1.5 mx-[5px] flex-shrink-0 ${DOT[item.severity]}`} title="Worked out automatically" />
      <div className="flex-1 min-w-0 basis-[calc(100%-2rem)] md:basis-auto">
        <div className="text-sm"><ChipName name={item.clientName} /><span className="font-medium">{item.title}</span></div>
        {item.detail && <div className="text-xs text-gray-400 mt-0.5">{item.detail}</div>}
      </div>
      {item.amount !== undefined && item.currency && (
        <div className="text-sm font-semibold tabular-nums flex-shrink-0 ml-5 md:ml-0">{money2(item.amount, item.currency)}</div>
      )}
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto md:ml-0">
        <button onClick={open} className="px-2 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">Open</button>
        {hiddenRow ? (
          <button onClick={() => restoreInboxItem(item.key)} className="px-2 py-1 text-xs text-accent hover:underline">Bring back</button>
        ) : (
          <>
            <button onClick={() => markInboxDone(item.key)} className="px-2 py-1 text-xs text-gray-400 hover:text-green-600" title="Hide until it gets worse">Done</button>
            <select
              aria-label="Snooze" value="" className="px-1 py-1 text-xs text-gray-400 bg-transparent border-0 cursor-pointer hover:text-gray-700"
              onChange={e => { if (e.target.value) snoozeInboxItem(item.key, addDays(today(), Number(e.target.value))) }}
            >
              <option value="">Snooze</option>
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">1 week</option>
            </select>
          </>
        )}
      </div>
    </div>
  )
}
