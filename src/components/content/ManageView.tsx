'use client'
import { useState } from 'react'
import { useStore } from '@/lib/store'
import { Modal, FormField, inputClass, selectClass } from '@/components/ui/Modal'
import { calendarDays, toDateStr, today, MONTH_NAMES, DOW_SHORT } from '@/lib/utils'
import type { Post, PostType } from '@/types'

const PLATFORM_LABEL: Record<PostType, string> = {
  post: 'IG Post', reel: 'IG Reel', story: 'IG Story', video: 'Video',
  tiktok: 'TikTok', shorts: 'YT Shorts', 'spotify-clip': 'Spotify Clip',
  tweet: 'X / Twitter', laylo: 'Laylo Blast',
}
const PLATFORM_STYLE: Record<PostType, string> = {
  post:            'bg-blue-50 border-blue-400 text-blue-700',
  reel:            'bg-purple-50 border-purple-400 text-purple-700',
  story:           'bg-pink-50 border-pink-400 text-pink-700',
  video:           'bg-blue-50 border-blue-400 text-blue-700',
  tiktok:          'bg-gray-100 border-gray-500 text-gray-700',
  shorts:          'bg-red-50 border-red-400 text-red-600',
  'spotify-clip':  'bg-green-50 border-green-400 text-green-700',
  tweet:           'bg-sky-50 border-sky-400 text-sky-700',
  laylo:           'bg-amber-50 border-amber-400 text-amber-700',
}

export function ManageView() {
  const client = useStore(s => s.getClient())
  const editable = useStore(s => s.canEdit('content'))
  const { calYear, calMonth, calPrev, calNext, calToday } = useStore()
  const [addDate, setAddDate] = useState<string | null>(null)
  const [editPost, setEditPost] = useState<Post | null>(null)

  if (!client) return null
  const days = calendarDays(calYear, calMonth)
  const todayStr = today()

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Calendar header */}
      <div className="flex-shrink-0 flex items-center gap-2.5 px-5 py-3.5 border-b border-gray-100">
        <button onClick={calPrev} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors">‹</button>
        <button onClick={calNext} className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50 text-sm transition-colors">›</button>
        <span className="font-serif text-[18px] font-medium">{MONTH_NAMES[calMonth]} {calYear}</span>
        <button onClick={calToday} className="px-2.5 py-1 border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors">Today</button>
        {editable && (
          <button onClick={() => setAddDate('')} className="ml-auto px-2.5 py-1 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors">+ New post</button>
        )}
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
                  !current ? 'bg-gray-50' : isToday ? 'bg-blue-50' : 'bg-canvas'
                }`}
              >
                <div className={`text-xs font-semibold mb-1 ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>{date.getDate()}</div>
                {posts.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setEditPost(p)}
                    className={`border-l-2 px-1.5 py-0.5 rounded-r text-[10px] font-semibold mb-0.5 cursor-pointer hover:brightness-95 transition-all truncate ${PLATFORM_STYLE[p.type]}`}
                    title={PLATFORM_LABEL[p.type]}
                  >
                    {p.title} {p.time}
                  </div>
                ))}
                {editable && (
                  <button
                    onClick={() => setAddDate(dStr)}
                    className="absolute top-1 right-1 w-5 h-5 rounded flex items-center justify-center text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-500 transition-all text-sm"
                  >
                    +
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {addDate !== null && <PostModal defaultDate={addDate} onClose={() => setAddDate(null)} />}
      {editPost && <PostModal post={editPost} onClose={() => setEditPost(null)} />}
    </div>
  )
}

// Posts are stored/displayed as "10:00am" but a native <input type="time">
// needs 24h "HH:MM" — convert at the edges rather than store either form
// exclusively, so both the picker and the display stay in their ideal shape.
function to24h(t: string): string {
  const m = t.match(/^(\d{1,2}):(\d{2})(am|pm)$/i)
  if (!m) return '10:00'
  let h = parseInt(m[1], 10)
  if (/pm/i.test(m[3]) && h !== 12) h += 12
  if (/am/i.test(m[3]) && h === 12) h = 0
  return `${String(h).padStart(2, '0')}:${m[2]}`
}
function to12h(t: string): string {
  const [h, m] = t.split(':')
  const hr = parseInt(h, 10) % 12 || 12
  const ampm = parseInt(h, 10) >= 12 ? 'pm' : 'am'
  return `${hr}:${m}${ampm}`
}

function PostModal({ post, defaultDate, onClose }: { post?: Post; defaultDate?: string; onClose: () => void }) {
  const editable = useStore(s => s.canEdit('content'))
  const { addPost, updatePost, deletePost } = useStore()
  const [title, setTitle] = useState(post?.title ?? '')
  const [date, setDate] = useState(post?.date ?? defaultDate ?? '')
  const [time, setTime] = useState(post ? to24h(post.time) : '10:00')
  const [type, setType] = useState<PostType>(post?.type ?? 'reel')

  function handleSave() {
    if (!title.trim() || !date) return
    const time12h = to12h(time)
    if (post) {
      updatePost(post.id, { date, title: title.trim(), time: time12h, type })
    } else {
      addPost(date, title.trim(), time12h, type)
    }
    onClose()
  }

  function handleDelete() {
    if (!post) return
    if (!confirm(`Remove "${post.title}" from the calendar?`)) return
    deletePost(post.id)
    onClose()
  }

  return (
    <Modal title={post ? 'Edit post' : 'Schedule a post'} onClose={onClose} footer={
      editable ? (
        <>
          {post && (
            <button onClick={handleDelete} className="px-3 py-1.5 border border-red-200 text-red-500 rounded-lg text-sm hover:bg-red-50 mr-auto">
              Delete post
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600">
            {post ? 'Save' : 'Schedule'}
          </button>
        </>
      ) : (
        <button onClick={onClose} className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Close</button>
      )
    }>
      <FormField label="Title">
        <input type="text" className={inputClass} placeholder="Post title" value={title} onChange={e => setTitle(e.target.value)} autoFocus disabled={!editable} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Date">
          <input type="date" className={inputClass} value={date} onChange={e => setDate(e.target.value)} disabled={!editable} />
        </FormField>
        <FormField label="Time">
          <input type="time" className={inputClass} value={time} onChange={e => setTime(e.target.value)} disabled={!editable} />
        </FormField>
      </div>
      <FormField label="Platform">
        <select className={selectClass} value={type} onChange={e => setType(e.target.value as PostType)} disabled={!editable}>
          {(Object.keys(PLATFORM_LABEL) as PostType[]).map(t => <option key={t} value={t}>{PLATFORM_LABEL[t]}</option>)}
        </select>
      </FormField>
      {post?.auto && (
        <div className="text-xs text-gray-400">Auto-generated from the release rollout template.</div>
      )}
    </Modal>
  )
}
