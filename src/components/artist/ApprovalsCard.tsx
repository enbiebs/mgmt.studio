'use client'
// "Waiting for your OK": the versions of their tracks that management asked the artist to approve. They listen right here and answer with
// "I approve it" or "I want changes" and a few words. The answer is theirs alone: the database only takes it from the artist's own login
// (migration 072), and shows their name and the time next to it for everyone. An answer is final for that version, so it is confirmed first.

import { useEffect, useRef, useState } from 'react'
import { useStore } from '@/lib/store'
import { getTrackAudioUrl } from '@/lib/db'
import { waitingForAnswer, type RoundRef } from '@/lib/round-approval'
import { dateWord } from '@/lib/contract-dates'
import { localDateOf } from '@/lib/utils'
import { notify } from '@/lib/notify'

/** Each listening link lasts this long (this is unreleased music); a fresh one is fetched when the artist presses play after it has aged. */
const LINK_SECONDS = 900
const LINK_FRESH_MS = 600_000

function Waiting({ r }: { r: RoundRef }) {
  const answerRound = useStore(s => s.answerRound)
  const previewing = useStore(s => !!s.previewMemberId)        // a manager looking at the artist's page: they may look, not answer for them
  const [link, setLink] = useState<{ url: string | null; at: number } | null>(null)
  const [note, setNote] = useState('')
  const [pick, setPick] = useState<'approved' | 'changes' | null>(null)
  const [busy, setBusy] = useState(false)
  const working = useRef(false)

  async function sign() {
    if (!r.round.audioPath) return
    setLink({ url: await getTrackAudioUrl(r.round.audioPath, LINK_SECONDS).catch(() => null), at: Date.now() })
  }
  useEffect(() => {
    const path = r.round.audioPath
    if (!path) return
    let live = true
    getTrackAudioUrl(path, LINK_SECONDS).catch(() => null).then(url => { if (live) setLink({ url, at: Date.now() }) })
    return () => { live = false }
  }, [r.round.audioPath])

  async function send() {
    if (!pick || working.current || previewing) return
    working.current = true; setBusy(true)
    const ok = await answerRound(r.round.id, pick, note)
    working.current = false; setBusy(false)
    if (ok) notify(pick === 'approved' ? 'Thanks, you approved it. Your manager has been told.' : 'Thanks, your notes were sent to your manager.')
  }

  const needNote = pick === 'changes' && !note.trim()
  return (
    <div className="space-y-2 rounded-xl border border-gray-100 p-3">
      <div>
        <div className="text-sm font-semibold">{r.trackTitle} <span className="font-normal text-gray-400">· {r.round.label}</span></div>
        <div className="text-[11px] text-gray-400">{r.albumTitle}{r.round.approval?.askedAt ? ` · asked ${dateWord(localDateOf(r.round.approval.askedAt))}` : ''}</div>
      </div>
      {!r.round.audioPath
        ? <div className="text-xs text-gray-400">There is no audio on this version.</div>
        : link === null
          ? <div className="text-xs text-gray-300">Loading the audio…</div>
          : link.url
            ? <audio
                controls preload="none" src={link.url} aria-label={`Listen to ${r.trackTitle}, ${r.round.label}`} className="h-9 w-full"
                onPlay={() => { if (Date.now() - link.at > LINK_FRESH_MS) void sign() }}
                onError={() => void sign()}
              />
            : <div className="text-xs text-amber-600">Couldn&apos;t load the audio. <button onClick={() => void sign()} className="underline">Try again</button></div>}
      <textarea
        value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={1000} aria-label="What you would like to say about this version"
        placeholder={pick === 'changes' ? 'What should change? (needed)' : 'Anything you want to say (optional)'}
        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm placeholder:text-gray-300 focus:border-[#4c8df6] focus:outline-none"
      />
      {previewing && <div className="text-xs text-gray-400">Preview only: the artist answers here, not you.</div>}
      {!pick ? (
        <div className="flex gap-2">
          <button onClick={() => setPick('approved')} disabled={previewing} className="flex-1 rounded-lg bg-green-600 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50">I approve it</button>
          <button onClick={() => setPick('changes')} disabled={previewing} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50">I want changes</button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-xs text-gray-500">{pick === 'approved' ? 'You are approving this version. It cannot be undone, but you can always ask for a new version.' : 'You are asking for changes to this version.'}</div>
          <div className="flex gap-2">
            <button onClick={() => setPick(null)} disabled={busy} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">Back</button>
            <button onClick={send} disabled={busy || needNote || previewing} className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-gray-700 disabled:opacity-50">{busy ? 'Sending…' : 'Send my answer'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

export function ApprovalsCard() {
  const client = useStore(s => s.getClient())
  if (!client) return null
  const waiting = waitingForAnswer(client)
  if (waiting.length === 0) return null
  return (
    <section aria-labelledby="waiting-ok" className="rounded-2xl border border-blue-200 bg-canvas p-5 lg:col-span-2">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="waiting-ok" className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Waiting for your OK</h2>
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">{waiting.length}</span>
      </div>
      <div className="space-y-3">{waiting.map(r => <Waiting key={r.round.id} r={r} />)}</div>
    </section>
  )
}
