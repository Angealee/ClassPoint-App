import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { TONE, type ToneName } from '@/lib/tone'

/**
 * A small status pill.
 *
 * The visual recipe (`rounded-full px-2.5 py-1 text-xs font-semibold` plus a
 * tinted background and matching foreground) was re-typed inline throughout the
 * app, and its colours were the same four-line table copied into four files —
 * see the note in lib/tone.ts.
 *
 * Colour comes from the ROLE, never from a caller-supplied class: that is what
 * keeps "rejected" and "an active nav item" from drifting back into the same
 * red. Pass `tone`, not `className="bg-…"`.
 */
export function Chip({
  tone = 'neutral',
  size = 'md',
  dot = false,
  children,
  className,
}: {
  tone?: ToneName
  size?: 'sm' | 'md'
  /** Leading dot in the role colour — for legends and dense status lists. */
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
