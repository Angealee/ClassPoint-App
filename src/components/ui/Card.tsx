import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

/**
 * Surface card used across the app.
 *
 * ── WHY THIS COULD NOT OWN A PADDING DEFAULT UNTIL NOW ─────────────────────
 * `cn` was a plain join until Era 6.0 Phase 2, so a default `p-4` here would
 * have emitted BOTH the default and the caller's `p-3`, with the winner decided
 * by alphabetical position in Tailwind's generated stylesheet rather than by
 * the author. `.p-3` @47233 precedes `.p-4` @47314, so the default would have
 * silently beaten every tight card while leaving `p-8` alone. That is why card
 * padding fragmented across six values in the first place.
 *
 * With tailwind-merge the caller wins, so an explicit `className="p-8"` still
 * overrides the default — but prefer the `pad` prop, which is the vocabulary.
 *
 * ⚠ `pad` defaults to 'default' (p-4). A card whose children already pad
 * themselves — every `divide-y` row list — MUST pass `pad="none"`, or the row
 * padding and the card padding stack.
 */

type CardPad = 'none' | 'tight' | 'default' | 'roomy'

const PADS: Record<CardPad, string> = {
  none: '',
  tight: 'p-3',
  default: 'p-4',
  roomy: 'p-5',
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  pad?: CardPad
  /** Hover/press affordance for a card that is itself a tap target. */
  interactive?: boolean
}

export function Card({ className, pad = 'default', interactive, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'theme-transition rounded-2xl border border-line bg-card shadow-sm',
        'shadow-black/5 dark:shadow-black/30',
        PADS[pad],
        interactive &&
          'cursor-pointer transition-[background-color,transform] hover:bg-card-2 active:scale-[0.99]',
        className,
      )}
      {...props}
    />
  )
}

/**
 * A card whose children are rows separated by hairlines.
 *
 * Absorbs `divide-y divide-line`, which appeared 41 times, and — more usefully
 * — makes `pad="none"` structural rather than something each call site has to
 * remember. Rows bring their own padding.
 */
export function Rows({ className, ...props }: Omit<CardProps, 'pad'>) {
  return <Card pad="none" className={cn('divide-y divide-line', className)} {...props} />
}
