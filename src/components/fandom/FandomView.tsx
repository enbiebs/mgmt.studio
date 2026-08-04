'use client'
// ──────────────────────────────────────────────────────────
//  FandomView — Fan Loyalty Platform
//  Based on the Fandom deck. Four panels:
//   Overview · Fans · Referrals · Messaging
//
//  Points: 1pt stream · 100pt ticket · 75pt merch · 50pt referral
//  Tiers:  Listener → Follower → Supporter → Devotee → Founder
// ──────────────────────────────────────────────────────────

import { useState } from 'react'
import { useStore } from '@/lib/store'
import type { FanTier } from '@/types'

type FandomTab = 'overview' | 'fans' | 'referrals' | 'messaging'

// ── Tier config ────────────────────────────────────────────
const TIER_CONFIG: Record<FanTier, { label: string; color: string; bg: string; min: number; perks: string[] }> = {
  listener:  { label: 'Listener',  color: '#94a3b8', bg: 'bg-slate-100',   min: 0,     perks: ['Access to fan feed'] },
  follower:  { label: 'Follower',  color: '#4c8df6', bg: 'bg-blue-50',     min: 500,   perks: ['Early content access', 'Fan feed'] },
  supporter: { label: 'Supporter', color: '#8b5cf6', bg: 'bg-purple-50',   min: 2000,  perks: ['Presale access', 'Exclusive downloads', 'DM priority'] },
  devotee:   { label: 'Devotee',   color: '#ec4899', bg: 'bg-pink-50',     min: 5000,  perks: ['Meet & greet eligibility', 'All Supporter perks', 'Merch discounts'] },
  founder:   { label: 'Founder',   color: '#f59e0b', bg: 'bg-amber-50',    min: 10000, perks: ['Backstage access', 'Numbered fan pass #1–20', 'All perks', 'Direct line to artist'] },
}

const ACTIVITY_ICON: Record<string, string> = {
  stream:   '🎵',
  ticket:   '🎟',
  merch:    '👕',
  referral: '🔗',
  share:    '📤',
}

export function FandomView() {
  const client = useStore(s => s.getClient())
  const [tab, setTab] = useState<FandomTab>('overview')
  const [msgCompose, setMsgCompose] = useState(false)
  const [msgSegment, setMsgSegment] = useState('all')
  const [msgSubject, setMsgSubject] = useState('')
  const [msgBody, setMsgBody]       = useState('')
  const [tierFilter, setTierFilter] = useState<FanTier | 'all'>('all')

  if (!client) return null
  const f = client.fandom

  const filteredFans = tierFilter === 'all'
    ? f.topFans
    : f.topFans.filter(fan => fan.tier === tierFilter)

  const tabs: { key: FandomTab; label: string }[] = [
    { key: 'overview',   label: 'Overview'   },
    { key: 'fans',       label: 'Fans'       },
    { key: 'referrals',  label: 'Referrals'  },
    { key: 'messaging',  label: 'Messaging'  },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Sub-nav */}
      <div className="flex-shrink-0 border-b border-gray-100 px-5 flex items-center gap-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.key
                ? 'border-[#f59e0b] text-[#b45309]'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex-shrink-0 pb-1">
          <span className="text-[10px] text-gray-300 uppercase tracking-widest">Fandom · Fan Loyalty</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div className="space-y-6">
            {/* Top stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Total Fans</div>
                <div className="font-serif text-2xl font-semibold">{f.totalFans.toLocaleString()}</div>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Points Issued</div>
                <div className="font-serif text-2xl font-semibold">
                  {f.pointsIssued >= 1_000_000 ? (f.pointsIssued / 1_000_000).toFixed(1) + 'M' : (f.pointsIssued / 1_000).toFixed(0) + 'K'}
                </div>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Via Referral</div>
                <div className="font-serif text-2xl font-semibold text-amber-600">{f.referralPct}%</div>
                <div className="text-xs text-gray-400 mt-0.5">joined via affiliate</div>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Live LTV</div>
                <div className="font-serif text-2xl font-semibold text-green-600">{f.liveAttendeeMultiplier}×</div>
                <div className="text-xs text-gray-400 mt-0.5">vs non-attendees</div>
              </div>
            </div>

            {/* Tier breakdown */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Fan Tiers</div>
              <div className="flex flex-col gap-3">
                {[...f.tierBreakdown].reverse().map(t => {
                  const tc = TIER_CONFIG[t.tier]
                  return (
                    <div key={t.tier} className="flex items-center gap-4">
                      <div className="flex items-center gap-2 w-28 flex-shrink-0">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: tc.color }} />
                        <span className="text-sm font-medium">{tc.label}</span>
                      </div>
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${Math.max(t.pct, 0.5)}%`, background: tc.color }}
                        />
                      </div>
                      <div className="text-xs text-gray-500 w-24 text-right flex-shrink-0">
                        {t.count.toLocaleString()} <span className="text-gray-300">({t.pct}%)</span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Tier perks quick view */}
              <div className="mt-5 pt-4 border-t border-gray-50 grid grid-cols-2 sm:grid-cols-5 gap-2">
                {Object.entries(TIER_CONFIG).reverse().map(([tier, tc]) => (
                  <div key={tier} className={`rounded-xl p-3 ${tc.bg}`}>
                    <div className="text-[10px] font-bold mb-1" style={{ color: tc.color }}>{tc.label}</div>
                    <ul className="text-[10px] text-gray-500 space-y-0.5">
                      {tc.perks.map(p => <li key={p}>· {p}</li>)}
                    </ul>
                    <div className="text-[9px] text-gray-400 mt-1.5">{tc.min.toLocaleString()}+ pts</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Points engine */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Points Engine</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { icon: '🎵', action: 'Stream',   pts: '1 pt',    detail: 'per stream' },
                  { icon: '🎟', action: 'Ticket',   pts: '100 pts', detail: 'per ticket purchased' },
                  { icon: '👕', action: 'Merch',    pts: '75 pts',  detail: 'per merch purchase' },
                  { icon: '🔗', action: 'Referral', pts: '50 pts',  detail: 'per successful referral' },
                ].map(item => (
                  <div key={item.action} className="border border-gray-100 rounded-xl p-3 text-center">
                    <div className="text-2xl mb-1">{item.icon}</div>
                    <div className="font-semibold text-sm">{item.action}</div>
                    <div className="font-serif text-lg font-bold text-amber-600">{item.pts}</div>
                    <div className="text-[10px] text-gray-400">{item.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent activity */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Recent Activity</div>
              <div className="flex flex-col gap-0">
                {f.recentActivity.map(a => (
                  <div key={a.id} className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
                    <span className="text-lg flex-shrink-0">{ACTIVITY_ICON[a.type] ?? '•'}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-sm">{a.fan}</span>
                      <span className="text-gray-400 text-sm"> — {a.detail}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs font-semibold text-amber-600">+{a.pts} pts</span>
                      <span className="text-xs text-gray-300">{a.date.slice(5)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── FANS ── */}
        {tab === 'fans' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {f.totalFans.toLocaleString()} fans · showing top {filteredFans.length}
              </div>
              <div className="flex gap-1 flex-wrap justify-end">
                {(['all', 'founder', 'devotee', 'supporter', 'follower', 'listener'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTierFilter(t)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                      tierFilter === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 px-4 py-2 border-b border-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-300">
                <span>#</span>
                <span>Fan</span>
                <span className="text-right">Points</span>
                <span className="text-right">Streams</span>
                <span className="text-right">Shows</span>
                <span className="text-right">Refs</span>
              </div>
              {filteredFans.map((fan, i) => {
                const tc = TIER_CONFIG[fan.tier]
                return (
                  <div
                    key={fan.id}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 px-4 py-3 border-b border-gray-50 last:border-0 items-center hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-xs text-gray-300 font-mono w-5 text-right">{fan.passNumber}</div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                          style={{ background: tc.color }}
                        >
                          {fan.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">{fan.name}</div>
                          <div className="flex items-center gap-1.5">
                            {fan.handle && <span className="text-[10px] text-gray-400">{fan.handle}</span>}
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${tc.bg}`} style={{ color: tc.color }}>
                              {tc.label.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-amber-600 text-right">{fan.points.toLocaleString()}</div>
                    <div className="text-xs text-gray-500 text-right">{(fan.streamsTotal / 1000).toFixed(1)}K</div>
                    <div className="text-xs text-gray-500 text-right">{fan.ticketsPurchased}</div>
                    <div className="text-xs text-gray-500 text-right">{fan.referralCount}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── REFERRALS ── */}
        {tab === 'referrals' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Via Referral</div>
                <div className="font-serif text-2xl font-semibold text-amber-600">{f.referralPct}%</div>
                <div className="text-xs text-gray-400">of all fans joined this way</div>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Top Referrer</div>
                <div className="font-serif text-lg font-semibold">{f.topFans[0]?.name ?? '—'}</div>
                <div className="text-xs text-amber-600">{f.topFans[0]?.totalDescendants ?? 0} total in network</div>
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl p-4 text-center">
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Total Network</div>
                <div className="font-serif text-2xl font-semibold">
                  {f.topFans.reduce((s, fan) => s + fan.totalDescendants, 0).toLocaleString()}
                </div>
                <div className="text-xs text-gray-400">descendants tracked</div>
              </div>
            </div>

            {/* Referral tree */}
            <div className="bg-white border border-gray-100 rounded-2xl p-5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Affiliate Tree — Top Nodes</div>
              <div className="flex flex-col gap-3">
                {f.topFans
                  .filter(fan => fan.referralCount > 0)
                  .sort((a, b) => b.totalDescendants - a.totalDescendants)
                  .map(fan => {
                    const tc = TIER_CONFIG[fan.tier]
                    const width = Math.min((fan.totalDescendants / (f.topFans[0]?.totalDescendants || 1)) * 100, 100)
                    return (
                      <div key={fan.id} className="flex items-center gap-4">
                        <div className="flex items-center gap-2 w-36 flex-shrink-0 min-w-0">
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: tc.color }} />
                          <span className="text-sm font-medium truncate">{fan.name}</span>
                        </div>
                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${width}%`, background: tc.color }}
                          />
                        </div>
                        <div className="text-xs text-gray-500 flex-shrink-0 w-32 text-right">
                          <span className="font-semibold text-amber-600">{fan.referralCount}</span> direct
                          <span className="text-gray-300 mx-1">·</span>
                          <span className="font-semibold">{fan.totalDescendants}</span> network
                        </div>
                      </div>
                    )
                  })}
              </div>
              <p className="text-xs text-gray-400 mt-4">
                Each fan's affiliate link permanently records who introduced whom. The referrer earns 50pts per successful conversion. Their profile shows the connection forever.
              </p>
            </div>

            {/* Why it matters */}
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <div className="font-semibold text-amber-800 text-sm mb-2">Why referrals matter</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-amber-700">
                <div>
                  <div className="font-semibold mb-0.5">{f.referralPct}% via affiliate</div>
                  <div>More than half your fanbase discovered you through another fan — not algorithms or ads.</div>
                </div>
                <div>
                  <div className="font-semibold mb-0.5">4.2× LTV for show-goers</div>
                  <div>Fans who attend live shows generate 4.2× more lifetime value. Referrers send them.</div>
                </div>
                <div>
                  <div className="font-semibold mb-0.5">Discovery credit tracked</div>
                  <div>When a fan puts a friend on, that moment is permanently recorded. No credit lost.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── MESSAGING ── */}
        {tab === 'messaging' && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {f.messages.length} campaigns sent
              </div>
              <button
                onClick={() => setMsgCompose(v => !v)}
                className="px-3 py-1.5 bg-amber-500 text-white text-xs font-semibold rounded-lg hover:bg-amber-600 transition-colors"
              >
                + New message
              </button>
            </div>

            {/* Compose */}
            {msgCompose && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <div className="text-sm font-semibold text-amber-800 mb-3">Compose message</div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Send to</label>
                    <select
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                      value={msgSegment}
                      onChange={e => setMsgSegment(e.target.value)}
                    >
                      <option value="all">All fans ({f.totalFans.toLocaleString()})</option>
                      <option value="founder">Founders only ({f.tierBreakdown.find(t => t.tier === 'founder')?.count ?? 0})</option>
                      <option value="devotee">Devotees + Founders</option>
                      <option value="supporter">Supporters + above</option>
                      <option value="follower">Followers + above</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Subject</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
                      placeholder="e.g. You'll hear it first — new music dropping Friday"
                      value={msgSubject}
                      onChange={e => setMsgSubject(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 font-medium block mb-1">Message</label>
                    <textarea
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm min-h-[100px] resize-none focus:outline-none focus:border-amber-400"
                      placeholder="Write something for your fans..."
                      value={msgBody}
                      onChange={e => setMsgBody(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button className="px-4 py-2 bg-amber-500 text-white text-sm font-semibold rounded-lg hover:bg-amber-600 transition-colors">
                      Send
                    </button>
                    <button
                      onClick={() => setMsgCompose(false)}
                      className="px-4 py-2 border border-gray-200 text-gray-500 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Sent campaigns */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-2 border-b border-gray-50 text-[10px] font-bold uppercase tracking-widest text-gray-300">
                <span>Message</span>
                <span className="text-right">Open</span>
                <span className="text-right">Click</span>
                <span className="text-right">Recipients</span>
              </div>
              {f.messages.map(msg => (
                <div key={msg.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 px-4 py-3 border-b border-gray-50 last:border-0 items-center hover:bg-gray-50 transition-colors">
                  <div>
                    <div className="font-medium text-sm">{msg.subject}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {msg.segment.charAt(0).toUpperCase() + msg.segment.slice(1)} · {msg.sentAt}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-green-600 text-right">{msg.openRate}%</div>
                  <div className="text-sm font-semibold text-blue-500 text-right">{msg.clickRate}%</div>
                  <div className="text-xs text-gray-500 text-right">{msg.recipients.toLocaleString()}</div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-xs text-blue-700">
              <strong>Segmentation tip:</strong> The person who streamed once last year should get a different message than the person who flew across the country for three shows. Tier-based targeting means every message lands in the right inbox.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
