// Screens that aren't connected to real data yet (so they'd show zeros or sample content).
// They stay hidden from everyone by default; a manager can switch them on for their own
// browser from the account menu (e.g. to demo them). Analytics shows up by itself for any
// artist who actually has analytics data.

import type { Client } from '@/types'

export const SHOW_UNFINISHED_KEY = 'studio-show-unfinished'

export const analyticsHasData = (c?: Client | null): boolean => !!c && (c.analytics?.streaming?.monthlyListeners ?? 0) > 0
