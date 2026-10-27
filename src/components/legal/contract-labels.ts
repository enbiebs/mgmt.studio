// The names, icons and colours for contract kinds and states, shared by the artist's Legal page, the contract form and the all-artists Legal page.
import type { ContractType } from '@/types'
import type { ContractDisplayStatus } from '@/lib/contract-status'

export const STATUS_CONFIG: Record<ContractDisplayStatus, { label: string; color: string; bg: string; dot: string }> = {
  draft:       { label: 'Draft',       color: 'text-gray-500',   bg: 'bg-gray-100',   dot: 'bg-gray-400'   },
  review:      { label: 'In Review',   color: 'text-amber-700',  bg: 'bg-amber-50',   dot: 'bg-amber-400'  },
  negotiation: { label: 'Negotiating', color: 'text-purple-700', bg: 'bg-purple-50',  dot: 'bg-purple-400' },
  signed:      { label: 'Signed',      color: 'text-green-700',  bg: 'bg-green-50',   dot: 'bg-green-500'  },
  expiring:    { label: 'Expiring',    color: 'text-amber-700',  bg: 'bg-amber-50',   dot: 'bg-amber-500'  },
  expired:     { label: 'Expired',     color: 'text-red-600',    bg: 'bg-red-50',     dot: 'bg-red-400'    },
  terminated:  { label: 'Terminated',  color: 'text-red-800',    bg: 'bg-red-100',    dot: 'bg-red-600'    },
}

export const TYPE_ICONS: Record<ContractType, string> = {
  management: '🧭',
  recording:  '🎙️',
  publishing: '✍️',
  sync:       '🎬',
  brand:      '🤝',
  touring:    '🎤',
  nda:        '🔒',
  merch:      '👕',
  other:      '📄',
}

export const TYPE_LABELS: Record<ContractType, string> = {
  management: 'Management',
  recording:  'Recording',
  publishing: 'Publishing',
  sync:       'Sync License',
  brand:      'Brand / Endorsement',
  touring:    'Touring / Agency',
  nda:        'NDA',
  merch:      'Merchandise',
  other:      'Other',
}

/** A contract value, in whole units ("$25,000"). */
export function fmt(n: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}
