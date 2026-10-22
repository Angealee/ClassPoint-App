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

/**
 * How far off the page a card sits.
 *
 * The two themes express this by different means, which is measured rather than
 * stylistic — see the MATERIAL block in index.css. Light mode carries depth with
 * a shadow (a white card on a #f3f3f6 canvas has something to cast onto); dark
 * mode carries it with a lit top edge, because canvas to card is only ΔL* 6.3
 * and a black shadow on #08080b has nothing to darken. Both facets ship on every
 * level, so a call site never branches on theme.
 *
 * 'flat' is the default and is byte-identical to what Card rendered before this
 * prop existed, so no existing card moved. Screens opt in as they are reviewed.
 */
type CardElevation = 'flat' | 'raised' | 'floating'

const ELEVATIONS: Record<CardElevation, string> = {
  // The original look: Tailwind's shadow-sm with a theme-aware tint.
  flat: 'shadow-sm shadow-black/5 dark:shadow-black/30',
  raised: 'cp-elev-2 cp-lit',
  floating: 'cp-elev-3 cp-lit',
}

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
  /**
   * ⚠ 'raised' and 'floating' add `.cp-lit`, which sets `position: relative`.
   * That cannot affect a `position: fixed` descendant (only transform, filter,
   * will-change and contain create a containing block for those, so every Sheet
   * backdrop is safe) but it DOES become the offset parent for an absolutely
   * positioned child. Check the card's children before raising it.
   */
  elevation?: CardElevation
}

export function Card({
  className,
  pad = 'default',
  interactive,
  elevation = 'flat',
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        'theme-transition rounded-2xl border border-line bg-card',
        ELEVATIONS[elevation],
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
