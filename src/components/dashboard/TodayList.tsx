'use client'
// ──────────────────────────────────────────────────────────
//  TodayList — the top of Home: everything that needs this person, in one list, grouped by date.
//  Two kinds of rows share it:
//    · to-dos somebody wrote down (check off, give to someone, set a date), and
//    · the automatic "needs you" items (overdue invoices, offers waiting on a reply) with Done / Snooze.
//  "Mine" shows what is given to you; "Everyone" shows the whole team's.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import { useToday, recallScope, rememberScope } from '@/lib/useToday'
import { BUCKET_LABEL, dueLabel, type Bucket, type TodoRow } from '@/lib/tasks'
import type { KeyDate } from '@/lib/key-dates'
import { notify } from '@/lib/notify'
import { STATUS_CONFIG } from '@/components/manager/ProjectsView'
import type { InboxItem, InboxSeverity } from '@/lib/inbox'
import { money2 } from '@/lib/settlement-math'
import { addDays, fromDateStr, today } from '@/lib/utils'
import type { BizSub, LegalSub, Project, Task, TourSub } from '@/types'
import { AddTodo } from './AddTodo'
import { AssigneeSelect, ChipName, ROW, TaskRow } from './todo-parts'

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

      <section className="glass mb-8 bg-canvas border border-gray-100 rounded-2xl p-4 md:p-5">
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
  if (row.kind === 'task') return <TaskRow task={row.task} clientId={row.clientId} clientName={row.clientName} me={me} />
  if (row.kind === 'project') return <ProjectRow project={row.project} clientId={row.clientId} clientName={row.clientName} me={me} />
  if (row.kind === 'keydate') return <KeyDateRow keyDate={row.keyDate} me={me} />
  return <AutoRow item={row.item} />
}

// ── A project (an artist's request, or one the team opened) given to someone ──

function ProjectRow({ project, clientId, clientName, me }: { project: Project; clientId: string; clientName: string; me: string | null }) {
  const assignProject = useStore(s => s.assignProject)
  const hasAccess = useStore(s => s.hasAccess)
  const mayChange = hasAccess('projects', clientId, true)
  const cfg = STATUS_CONFIG[project.status]
  const late = !!project.dueDate && project.dueDate < today()
  const unclaimed = !project.assigneeId

  function open() {
    const s = useStore.getState()
    s.openClient(clientId)
    s.setSection('projects')
  }
  const assign = (id: string | null) => assignProject(project.id, id)

  return (
    <div className={ROW}>
      <span className="mt-0.5 w-[18px] h-[18px] rounded-md border-[1.5px] border-gray-200 bg-gray-50 flex items-center justify-center text-[9px] font-bold text-gray-400 flex-shrink-0" title="A project">P</span>
      <div className="flex-1 min-w-0 basis-[calc(100%-2rem)] md:basis-auto">
        <div className="text-sm"><ChipName name={clientName} /><span className="font-medium break-words">{project.title}</span></div>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${cfg.bg}`}>{cfg.label}</span>
          {project.fromArtist && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700">From the artist</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto md:ml-0">
        {project.dueDate && <span className={`px-2 py-1 text-xs ${late ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{dueLabel(project.dueDate, today())}</span>}
        {unclaimed && mayChange && me && (
          <button onClick={() => assign(me)} className="px-2 py-1 border border-accent/40 text-accent bg-accent-soft rounded-lg text-xs font-medium hover:bg-accent-soft/70">Take it</button>
        )}
        <AssigneeSelect
          clientId={clientId} value={project.assigneeId} noneLabel="Nobody yet" disabled={!mayChange}
          onChange={assign}
          className="px-1 py-1 text-xs text-gray-400 bg-transparent border-0 cursor-pointer hover:text-gray-700 max-w-[110px] truncate disabled:cursor-default"
        />
        <button onClick={open} className="px-2 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">Open</button>
      </div>
    </div>
  )
}

// ── A key date: something a show needs by a day, worked out automatically, up for grabs ──

function KeyDateRow({ keyDate: kd, me }: { keyDate: KeyDate; me: string | null }) {
  const hasAccess = useStore(s => s.hasAccess)
  const people = useStore(s => s.workspacePeople)
  const mayTake = hasAccess('tour', kd.clientId, true)      // the to-do points at a show, so the database needs Tour edit access
  const late = kd.due < today()

  // Taking it makes a real to-do, given to that person, pointing at the show. The key stops it coming back.
  function take(assignee: string | null) {
    const id = useStore.getState().addTask(kd.clientId, {
      title: kd.title, dueDate: kd.due, assigneeId: assignee || undefined,
      link: { type: 'show', id: kd.showId }, source: 'auto', autoKey: kd.key,
    })
    if (id && assignee && assignee !== me) {
      const who = people.find(p => p.userId === assignee)?.label ?? 'them'
      notify(`Given to ${who}`, { label: 'Undo', run: () => useStore.getState().deleteTask(kd.clientId, id) })
    }
  }
  function open() {
    const s = useStore.getState()
    s.openClient(kd.clientId)
    s.setSection('tour')
    s.setTourSub(kd.go.sub)
    s.setSelectedShow(kd.showId)
  }

  return (
    <div className={ROW}>
      <span className="mt-0.5 w-[18px] h-[18px] rounded-md border-[1.5px] border-gray-200 bg-gray-50 flex items-center justify-center text-[9px] font-bold text-gray-400 flex-shrink-0" title="A key date, worked out from the show's date">D</span>
      <div className="flex-1 min-w-0 basis-[calc(100%-2rem)] md:basis-auto">
        <div className="text-sm"><ChipName name={kd.clientName} /><span className="font-medium break-words">{kd.title}</span></div>
        <div className="text-xs text-gray-400 mt-0.5">{kd.detail ?? 'Due ahead of the show'}</div>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0 ml-auto md:ml-0">
        <span className={`px-2 py-1 text-xs ${late ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{dueLabel(kd.due, today())}</span>
        {mayTake && me && <button onClick={() => take(me)} className="px-2 py-1 border border-accent/40 text-accent bg-accent-soft rounded-lg text-xs font-medium hover:bg-accent-soft/70">Take it</button>}
        {mayTake && <AssigneeSelect clientId={kd.clientId} value={undefined} noneLabel="Give to…" onChange={id => { if (id) take(id) }} className="px-1 py-1 text-xs text-gray-400 bg-transparent border-0 cursor-pointer hover:text-gray-700 max-w-[110px] truncate" />}
        <button onClick={open} className="px-2 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50">Open</button>
      </div>
    </div>
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
  const { openClient, setSection, setBizSub, setTourSub, setLegalSub, markInboxDone, snoozeInboxItem, restoreInboxItem } = useStore()

  function open() {
    openClient(item.clientId)
    setSection(item.go.section)
    if (item.go.section === 'finance' && item.go.sub) setBizSub(item.go.sub as BizSub)
    if (item.go.section === 'tour' && item.go.sub) setTourSub(item.go.sub as TourSub)
    if (item.go.section === 'legal' && item.go.sub) setLegalSub(item.go.sub as LegalSub)
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
