'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass } from '@/components/ui/Modal'
import { calendarDays, toDateStr, today, MONTH_NAMES, DOW_SHORT } from '@/lib/utils'

export function ManageView() {
  const client = useStore(s => s.getClient())
  const { calYear, calMonth, calPrev, calNext, calToday, addPost, deletePost } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [clickedDate, setClickedDate] = useState('')
  const [f, setF] = useState({ title: '', date: '', time: '10:00' })
  const [viewPost, setViewPost] = useState<null | { id: string; title: string; date: string; time: string }>(null)

  if (!client) return null
  const days = calendarDays(calYear, calMonth)
  const todayStr = today()

  function openAdd(date?: string) {
    setF({ title: '', date: date ?? '', time: '10:00' })
    setClickedDate(date ?? '')
    setAddOpen(true)
  }

  function handleAdd() {
    if (!f.title.trim() || !f.date) return
    const [h, m] = f.time.split(':')
    const hr = parseInt(h) % 12 || 12
    const ampm = parseInt(h) >= 12 ? 'pm' : 'am'
    addPost(f.date, f.title.trim(), `${hr}:${m}${ampm}`, 'reel')
    setAddOpen(false)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Calendar header */}
      <div className="flex-shrink-0 flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
        <button onClick={calPrev} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors">‹</button>
        <button onClick={calNext} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors">›</button>
        <span className="font-serif text-[18px] font-medium">{MONTH_NAMES[calMonth]} {calYear}</span>
        <button onClick={calToday} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">Today</button>
        <button onClick={() => openAdd()} className="ml-auto px-2.5 py-1 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors">+ New post</button>
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-7 gap-px bg-gray-100 border border-gray-100 rounded-xl overflow-hidden">
          {DOW_SHORT.map(d => (
            <div key={d} className="bg-gray-50 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-gray-400">{d}</div>
          ))}
          {days.map(({ date, current }, i) => {
            const dStr = toDateStr(date)
            const isToday = dStr === todayStr
            const posts = client.content.posts.filter(p => p.date === dStr)
            return (
              <div
                key={i}
                className={`relative min-h-[88px] p-1.5 group ${
                  !current ? 'bg-gray-50' : isToday ? 'bg-blue-50' : 'bg-white'
                }`}
              >
                <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>{date.getDate()}</div>
                {posts.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setViewPost(p)}
                    className="bg-blue-50 border-l-2 border-blue-400 px-1.5 py-0.5 rounded-r text-[10px] font-semibold text-blue-700 mb-0.5 cursor-pointer hover:bg-blue-100 transition-colors truncate"
                  >
                    {p.title} {p.time}
                  </div>
                ))}
                <button
                  onClick={() => openAdd(dStr)}
                  className="absolute top-1 right-1 w-5 h-5 rounded flex items-center justify-center text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-500 transition-all text-sm"
                >
                  +
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Add post modal */}
      {addOpen && (
        <Modal title="Schedule a post" onClose={() => setAddOpen(false)} footer={
          <>
            <button onClick={() => setAddOpen(false)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
            <button onClick={handleAdd} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Schedule</button>
          </>
        }>
          <FormField label="Title"><input type="text" className={inputClass} placeholder="Post title" value={f.title} onChange={e => setF(p => ({...p, title: e.target.value}))} autoFocus /></FormField>
          <FormField label="Date"><input type="date" className={inputClass} value={f.date} onChange={e => setF(p => ({...p, date: e.target.value}))} /></FormField>
          <FormField label="Time"><input type="time" className={inputClass} value={f.time} onChange={e => setF(p => ({...p, time: e.target.value}))} /></FormField>
        </Modal>
      )}

      {/* View/delete post modal */}
      {viewPost && (
        <Modal title={viewPost.title} onClose={() => setViewPost(null)} footer={
          <>
            <button
              onClick={() => { deletePost(viewPost.id); setViewPost(null) }}
              className="px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50 mr-auto"
            >
              Delete post
            </button>
            <button onClick={() => setViewPost(null)} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">Close</button>
          </>
        }>
          <p className="text-sm text-gray-500">{viewPost.date} · {viewPost.time}</p>
        </Modal>
      )}
    </div>
  )
}
