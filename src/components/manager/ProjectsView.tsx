'use client'
// ──────────────────────────────────────────────────────────
//  ProjectsView — Manager-side project tracking
//  Shows all projects for the current client.
//  Managers can create, assign, and update project status.
//  Artist-submitted requests appear with a special indicator.
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import type { ProjectType, ProjectStatus, Stakeholder } from '@/types'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'

// ── Display helpers ────────────────────────────────────────
const TYPE_LABELS: Record<ProjectType, string> = {
  release:    'Release',
  show:       'Show / Tour',
  content:    'Content',
  'brand-deal': 'Brand Deal',
  merch:      'Merch',
  other:      'Other',
}

const STATUS_CONFIG: Record<ProjectStatus, { label: string; bg: string; dot: string }> = {
  submitted:   { label: 'Submitted',   bg: 'bg-amber-50 text-amber-700',   dot: 'bg-amber-400' },
  'in-progress': { label: 'In Progress', bg: 'bg-blue-50 text-blue-600',     dot: 'bg-blue-500'  },
  review:      { label: 'In Review',   bg: 'bg-purple-50 text-purple-700', dot: 'bg-purple-500' },
  done:        { label: 'Done',        bg: 'bg-green-50 text-green-700',   dot: 'bg-green-500'  },
}

const STAKEHOLDERS: Stakeholder[] = ['GC', 'EB', 'PH', 'MS']

const STAKEHOLDER_TOOLTIPS: Record<Stakeholder, string> = {
  GC: 'GC — CEO',
  EB: 'EB — Partner',
  PH: 'PH — Day-to-Day',
  MS: 'MS — Coordinator',
}

const STATUS_NEXT: Record<ProjectStatus, ProjectStatus | null> = {
  submitted:     'in-progress',
  'in-progress': 'review',
  review:        'done',
  done:          null,
}

export function ProjectsView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('projects'))
  const { addProject, updateProjectStatus, assignProject, deleteProject, openModal, modal, closeModal } = useStore()
  const [filter, setFilter] = useState<'all' | ProjectStatus>('all')

  if (!client) return null
  const projects = client.projects ?? []

  const filtered = filter === 'all' ? projects : projects.filter(p => p.status === filter)
  const counts = {
    submitted:     projects.filter(p => p.status === 'submitted').length,
    'in-progress': projects.filter(p => p.status === 'in-progress').length,
    review:        projects.filter(p => p.status === 'review').length,
    done:          projects.filter(p => p.status === 'done').length,
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
            Projects &amp; Requests
          </div>
          <div className="text-xs text-gray-400">
            {projects.filter(p => p.status === 'submitted').length > 0 && (
              <span className="text-amber-600 font-medium">
                {projects.filter(p => p.fromArtist && p.status === 'submitted').length} artist request{projects.filter(p => p.fromArtist && p.status === 'submitted').length !== 1 ? 's' : ''} pending ·{' '}
              </span>
            )}
            {projects.length} total
          </div>
        </div>
        {editable && (
          <button
            onClick={() => openModal('add-project')}
            className="px-3 py-1.5 bg-[#4c8df6] text-white text-xs font-semibold rounded-lg hover:bg-blue-600 transition-colors"
          >
            + New project
          </button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 flex-wrap">
        {(['all', 'submitted', 'in-progress', 'review', 'done'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === f
                ? 'bg-gray-900 text-canvas'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {f === 'all' ? `All (${projects.length})` : `${STATUS_CONFIG[f].label} (${counts[f]})`}
          </button>
        ))}
      </div>

      {/* Project cards */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 && (
          <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center text-gray-400 text-sm">
            No projects in this category
          </div>
        )}

        {filtered.map(project => {
          const sc = STATUS_CONFIG[project.status]
          const next = STATUS_NEXT[project.status]
          return (
            <div
              key={project.id}
              className={`border rounded-xl px-4 py-3 ${
                project.fromArtist && project.status === 'submitted'
                  ? 'border-amber-200 bg-amber-50/30'
                  : 'border-gray-100 bg-canvas'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Status dot */}
                <div className="mt-1.5 flex-shrink-0">
                  <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{project.title}</span>
                    {project.fromArtist && (
                      <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">
                        FROM ARTIST
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 uppercase font-medium tracking-wide">
                      {TYPE_LABELS[project.type]}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                    {/* Status badge */}
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${sc.bg}`}>
                      {sc.label}
                    </span>

                    {/* Assignee */}
                    <select
                      value={project.assignee ?? ''}
                      onChange={e => assignProject(project.id, e.target.value as Stakeholder)}
                      disabled={!editable}
                      className="text-xs text-gray-500 border border-gray-200 rounded-md px-2 py-0.5 bg-canvas hover:border-gray-300 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                      title={project.assignee ? STAKEHOLDER_TOOLTIPS[project.assignee] : 'Unassigned'}
                    >
                      <option value="">Unassigned</option>
                      {STAKEHOLDERS.map(s => (
                        <option key={s} value={s} title={STAKEHOLDER_TOOLTIPS[s]}>{s} — {STAKEHOLDER_TOOLTIPS[s].split('—')[1].trim()}</option>
                      ))}
                    </select>

                    {/* Due date */}
                    {project.dueDate && (
                      <span className="text-xs text-gray-400">Due {project.dueDate}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {editable && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {next && (
                      <button
                        onClick={() => updateProjectStatus(project.id, next)}
                        className="px-2.5 py-1 text-[11px] font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors whitespace-nowrap"
                      >
                        → {STATUS_CONFIG[next].label}
                      </button>
                    )}
                    <button
                      onClick={() => deleteProject(project.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none px-1"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Add project modal */}
      {modal === 'add-project' && <AddProjectModal onClose={closeModal} />}
    </div>
  )
}

// ── Add Project Modal ──────────────────────────────────────
function AddProjectModal({ onClose }: { onClose: () => void }) {
  const { addProject } = useStore()
  const [title, setTitle]       = useState('')
  const [type, setType]         = useState<ProjectType>('release')
  const [assignee, setAssignee] = useState<Stakeholder | ''>('')
  const [dueDate, setDueDate]   = useState('')

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    addProject(title.trim(), type, assignee || undefined, dueDate || undefined, false)
    onClose()
  }

  return (
    <Modal title="New Project" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <FormField label="Project title">
          <input
            className={inputClass}
            placeholder="e.g. Brooklyn Mirage advancing"
            value={title}
            onChange={e => setTitle(e.target.value)}
            autoFocus
          />
        </FormField>

        <FormField label="Type">
          <select className={selectClass} value={type} onChange={e => setType(e.target.value as ProjectType)}>
            {(Object.entries(TYPE_LABELS) as [ProjectType, string][]).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Assign to">
          <select className={selectClass} value={assignee} onChange={e => setAssignee(e.target.value as Stakeholder)}>
            <option value="">Unassigned</option>
            {STAKEHOLDERS.map(s => (
              <option key={s} value={s}>{s} — {STAKEHOLDER_TOOLTIPS[s].split('—')[1].trim()}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Due date (optional)">
          <input
            type="date"
            className={inputClass}
            value={dueDate}
            onChange={e => setDueDate(e.target.value)}
          />
        </FormField>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="flex-1 py-2 bg-[#4c8df6] text-white font-semibold rounded-xl text-sm hover:bg-blue-600 transition-colors"
          >
            Add project
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 border border-gray-200 text-gray-500 font-medium rounded-xl text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
