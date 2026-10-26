// Screens that aren't connected to real data yet (so they'd show zeros or sample content).
// They stay hidden from everyone by default; a manager can switch them on for their own
// browser from the account menu (e.g. to demo them). Analytics shows up by itself for any
// artist who actually has analytics data.

import type { Client, ContentSub } from '@/types'
import { effectiveSub } from '@/lib/item-access'

export const SHOW_UNFINISHED_KEY = 'studio-show-unfinished'

export const analyticsHasData = (c?: Client | null): boolean => !!c && (c.analytics?.streaming?.monthlyListeners ?? 0) > 0

// Content > Studio and Content > Lab are not built yet (Studio is a mock-up that does nothing), so they stay hidden like the other
// unfinished screens. Someone who arrives on one by an old link or a saved tab lands on Manage, the real page.

export const UNFINISHED_CONTENT_TABS: readonly string[] = ['studio', 'lab']

export const contentTabVisible = (key: string, showUnfinished: boolean): boolean => showUnfinished || !UNFINISHED_CONTENT_TABS.includes(key)

export const contentTabFor = (sub: ContentSub, showUnfinished: boolean): ContentSub => (contentTabVisible(sub, showUnfinished) ? sub : 'manage')

/** The Content tab to show: the one asked for, kept inside what this person may open and what is built (a stale link to Studio lands on Manage). */
export const contentSubFor = (raw: ContentSub, allowedTabs: string[] | undefined, showUnfinished: boolean): ContentSub =>
  contentTabFor(effectiveSub(raw, allowedTabs) as ContentSub, showUnfinished)
