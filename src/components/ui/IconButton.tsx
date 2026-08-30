import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * A button whose only content is an icon.
 *
 * Absorbs 44 hand-rolled instances that between them used THIRTEEN different
 * size × radius combinations (h-7/8/9/10/11/12 against rounded-lg/xl/2xl/full).
 *
 * ── TOUCH TARGETS ──────────────────────────────────────────────────────────
 * Most of those were 36px (`h-9`), below the 44px both Apple and Google
 * recommend. Rather than making every icon in the app visibly bigger — which
 * would thicken every header and roster row — the button keeps its visual size
 * and grows an INVISIBLE 44×44 tap region via a `::before` pseudo-element.
 * The layout is unchanged; the thumb target is not.
 *
 * ⚠ ADJACENCY RULE. Two expanded hit areas overlap if their centres are closer
 * than 44px, and in the overlap the later element in DOM order wins — which
 * for an edit/delete pair means a tap near the seam can hit the wrong one.
 * A row of `md` (36px) buttons therefore needs at least `gap-2` (8px):
 * 36 + 8 = 44px centre spacing, exactly touching, never overlapping.
 * For `sm` (32px) the minimum is `gap-3`. Groups tighter than that should use
 * `expandHitArea={false}` and accept the smaller target.
 *
 * `label` is REQUIRED and becomes `aria-label` — an icon-only control is
 * unreadable to a screen reader without it, and the hand-rolled versions were
 * inconsistent about providing one.
 */

type IconButtonSize = 'sm' | 'md' | 'lg'
type IconButtonVariant = 'ghost' | 'outline' | 'danger' | 'accent' | 'solid'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name. Required — this control has no visible text. */
  label: string
  icon: ReactNode
  size?: IconButtonSize
  variant?: IconButtonVariant
  /** Circular rather than rounded-square. */
  round?: boolean
  /** Opt out of the 44px tap region — see the adjacency rule above. */
  expandHitArea?: boolean
}

const SIZES: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
  lg: 'h-11 w-11',
}

/**
 * Taken from what the call sites actually did, not from a theoretical set.
 *
 * `danger` rests MUTED and only turns red on hover. That is deliberate and it
 * is what every destructive icon in the app already did (`text-muted
 * hover:text-brand-500`): a trash icon that shouts before you reach for it
 * makes a roster look alarming. The hover colour is the Phase 4 danger token —
 * those hover states were still brand red, which the colour sweep missed
 * because it only rewrote resting foregrounds.
 */
const VARIANTS: Record<IconButtonVariant, string> = {
  ghost: 'text-muted hover:bg-card-2 hover:text-ink',
  outline: 'border border-line text-muted hover:text-ink',
  danger: 'text-muted hover:bg-danger-solid/10 hover:text-danger',
  accent: 'text-accent hover:bg-accent-solid/10',
  solid: 'bg-accent-solid text-white hover:brightness-110',
}

export function IconButton({
  label,
  icon,
  size = 'md',
  variant = 'ghost',
  round = false,
  expandHitArea = true,
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center',
        'transition-colors active:scale-95',
        'disabled:pointer-events-none disabled:opacity-50',
        round ? 'rounded-full' : 'rounded-lg',
        SIZES[size],
        VARIANTS[variant],
        // 44x44 invisible tap region, centred. `lg` is already 44.
        expandHitArea &&
          size !== 'lg' &&
          'before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[""]',
        className,
      )}
      {...props}
    >
      {icon}
    </button>
  )
}
