'use client'
// ──────────────────────────────────────────────────────────
//  ItemTodos — the "To-do" button on a show, offer, invoice, bill, contract or project. It shows how many
//  open to-dos belong to that one thing, and opens a small window with them and a pre-filled "add" line:
//  the artist, the link back to this item and the person (you) are already set, so a to-do is one line
//  and Enter. Everything added here also shows up on Today.
// ──────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, inputClass, selectClass } from '@/components/ui/Modal'
import { parseQuickTodo, peopleFor, taskSection } from '@/lib/tasks'
import { useMe } from '@/lib/useToday'
import { today } from '@/lib/utils'
import type { Task, TaskLinkType } from '@/types'
import { DueButton } from './todo-parts'

interface Props {
  link: { type: TaskLinkType; id: string }
  /** The words the add line starts with, e.g. "Chase invoice INV-007". */
  suggest: string
  /** The artist; defaults to the one that is open. */
  clientId?: string
}

export function ItemTodos({ link, suggest, clientId: forClient }: Props) {
  const role = useStore(s => s.role)
  const openId = useStore(s => s.clientId)
  const clientId = forClient ?? openId
  const open = useStore(s => s.data.clients.find(c => c.id === clientId)?.tasks)
  const [show, setShow] = useState(false)

  const mine = useMemo(() => (open ?? []).filter(t => t.link?.type === link.type && t.link.id === link.id), [open, link.type, link.id])
  const count = mine.filter(t => !t.doneAt).length

  // The artist's own login never sees the management side's to-dos.
  if (role === 'artist' || !clientId) return null

  // The wrapper keeps clicks (and the window) from reaching a clickable card this button sits on.
  return (
    <span onClick={e => e.stopPropagation()} className="inline-flex">
      <button
        type="button"
        onClick={() => setShow(true)}
        title="To-dos about this"
        className={`px-2.5 py-1 border rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
          count > 0 ? 'border-accent/40 text-accent bg-accent-soft hover:bg-accent-soft/70' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
        }`}
      >
        {count > 0 ? `To-do · ${count}` : 'To-do'}
      </button>
      {show && <ItemTodosWindow clientId={clientId} link={link} suggest={suggest} tasks={mine} onClose={() => setShow(false)} />}
    </span>
  )
}

function ItemTodosWindow({ clientId, link, suggest, tasks, onClose }: { clientId: string; link: Props['link']; suggest: string; tasks: Task[]; onClose: () => void }) {
  const { addTask, toggleTask, updateTask, deleteTask } = useStore()
  const people = useStore(s => s.workspacePeople)
  const hasAccess = useStore(s => s.hasAccess)
  const me = useMe()
  const mayAdd = hasAccess(taskSection(link), clientId, true)
  const options = peopleFor(people, clientId, me)
  const choices = me && !options.some(p => p.userId === me) ? [{ userId: me, label: 'Me' }, ...options] : options

  const [title, setTitle] = useState(suggest)
  const [due, setDue] = useState('')
  const [given, setGiven] = useState<string | null>(null)   // null = still the default (me)
  const who = given ?? me ?? ''

  const day = today()
  const open = tasks.filter(t => !t.doneAt).sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  const done = tasks.filter(t => t.doneAt).sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '')).slice(0, 3)
  const nameOf = (id?: string) => (!id ? 'Nobody yet' : id === me ? 'Me' : people.find(p => p.userId === id)?.label ?? 'Someone')

  function submit() {
    const typed = title.trim()
    if (!typed) return
    const parsed = parseQuickTodo(typed, day)
    const id = addTask(clientId, { title: due ? typed : parsed.title, dueDate: due || parsed.dueDate, assigneeId: who || undefined, link })
    if (id) { setTitle(''); setDue('') }
  }

  return (
    <Modal title="To-dos about this" onClose={onClose} footer={<button onClick={onClose} className="px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg hover:bg-gray-50">Close</button>}>
      {open.length === 0 && done.length === 0 && <p className="text-sm text-gray-400">Nothing on the list for this yet.</p>}

      {open.map(t => {
        const mayChange = t.assigneeId === me || hasAccess(taskSection(link), clientId, true)
        return (
          <div key={t.id} className="flex items-start gap-2.5 py-1.5 border-t border-gray-50 first:border-t-0">
            <button
              role="checkbox" aria-checked={false} aria-label={`Mark “${t.title}” done`} disabled={!mayChange}
              onClick={() => toggleTask(clientId, t.id)}
              className="mt-0.5 w-[18px] h-[18px] rounded-full border-[1.5px] border-gray-300 hover:border-accent hover:bg-accent-soft disabled:opacity-40 flex-shrink-0 transition-colors"
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium break-words">{t.title}</div>
              <div className="text-xs text-gray-400">For {nameOf(t.assigneeId)}</div>
            </div>
            <DueButton value={t.dueDate} late={!!t.dueDate && t.dueDate < day} disabled={!mayChange} onChange={v => updateTask(clientId, t.id, { dueDate: v })} />
            {mayChange && (
              <button
                aria-label={`Remove “${t.title}”`} title="Remove"
                onClick={() => { if (confirm(`Remove this to-do?\n\n${t.title}`)) deleteTask(clientId, t.id) }}
                className="px-1.5 py-1 text-sm leading-none text-gray-300 hover:text-red-500"
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      {done.length > 0 && (
        <div className="pt-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Finished</div>
          {done.map(t => (
            <div key={t.id} className="flex items-center gap-2.5 py-1 text-sm text-gray-400">
              <span className="w-[18px] h-[18px] rounded-full bg-gray-300 text-white flex items-center justify-center text-[10px] flex-shrink-0">✓</span>
              <span className="flex-1 min-w-0 line-through decoration-gray-300 break-words">{t.title}</span>
              <button onClick={() => toggleTask(clientId, t.id)} className="text-xs text-accent hover:underline">Undo</button>
            </div>
          ))}
        </div>
      )}

      {mayAdd ? (
        <div className="pt-3 mt-1 border-t border-gray-100 space-y-2">
          <input
            autoFocus value={title} maxLength={300} aria-label="New to-do"
            onChange={e => setTitle(e.target.value)}
            onFocus={e => e.currentTarget.select()}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
            placeholder="What needs doing?"
            className={inputClass}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Given to" value={who} onChange={e => setGiven(e.target.value)} className={`${selectClass} !w-auto`}>
              <option value="">Nobody yet</option>
              {choices.map(p => <option key={p.userId} value={p.userId}>{p.userId === me ? 'Me' : p.label}</option>)}
            </select>
            <input type="date" aria-label="Due date" value={due} onChange={e => setDue(e.target.value)} className={`${inputClass} !w-auto`} />
            <button
              onClick={submit} disabled={!title.trim()}
              className="ml-auto px-3 py-1.5 text-sm font-medium rounded-lg bg-accent text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-default transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <p className="pt-3 mt-1 border-t border-gray-100 text-xs text-gray-400">You can see these but not add new ones.</p>
      )}
    </Modal>
  )
}
