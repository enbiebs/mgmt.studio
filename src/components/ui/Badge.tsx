import { cn } from '@/lib/cn'

type Variant = 'green' | 'amber' | 'blue' | 'red' | 'gray' | 'purple'

const VARIANTS: Record<Variant, string> = {
  green:  'bg-green-50  text-green-700',
  amber:  'bg-amber-50  text-amber-700',
  blue:   'bg-blue-50   text-blue-700',
  red:    'bg-red-50    text-red-600',
  gray:   'bg-gray-100  text-gray-500',
  purple: 'bg-purple-50 text-purple-700',
}

export function Badge({ variant = 'gray', children }: { variant?: Variant; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold', VARIANTS[variant])}>
      {children}
    </span>
  )
}
