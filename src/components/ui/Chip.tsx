import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { TONE, type ToneName } from '@/lib/tone'

export function Chip({
  tone = 'neutral',
  size = 'md',
  dot = false,
  children,
  className,
}: {
  tone?: ToneName
  size?: 'sm' | 'md'
  dot?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold',
        size === 'sm' ? 'px-2 py-0.5 text-2xs' : 'px-2.5 py-1 text-xs',
        TONE[tone].chip,
        className,
      )}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', TONE[tone].dot)} />}
      {children}
    </span>
  )
}
