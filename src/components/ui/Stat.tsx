import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { TONE, type ToneName } from '@/lib/tone'

/**
 * A single figure with its label — rank, streak, attended, show-up rate.
 *
 * ── SCOPE NOTE ─────────────────────────────────────────────────────────────
 * Phase 6 rebuilds the home screen around one composed hero, so this is
 * deliberately built to COMPOSE rather than to be a finished home-screen
 * widget: it renders a figure and a label and nothing else — no card, no
 * border, no fixed width. The hero can lay several out however it wants, and a
 * card-shaped variant belongs to whatever that design turns out to need.
 *
 * `tabular-nums` is not cosmetic here: these numbers update live (a rank
 * shifts, a streak ticks over), and proportional digits make the whole row
 * jitter sideways when a 1 becomes a 7.
 */
export function Stat({
  value,
  label,
  tone,
  icon,
  hint,
  align = 'center',
  className,
}: {
  value: ReactNode
  label: ReactNode
  /** Colours the figure. Leave unset for plain ink. */
  tone?: ToneName
  /** Small glyph shown beside the figure. */
  icon?: ReactNode
  /** Third line, smaller and muted — a delta or a target. */
  hint?: ReactNode
  align?: 'center' | 'start'
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5',
        align === 'center' ? 'items-center text-center' : 'items-start text-left',
        className,
      )}
    >
      <span className="flex items-center gap-1">
        {icon}
        <span
          className={cn(
            'font-display text-xl font-bold tabular-nums',
            tone ? TONE[tone].text : 'text-ink',
          )}
        >
          {value}
        </span>
      </span>
      <span className="truncate text-2xs font-medium uppercase tracking-wide text-muted">
        {label}
      </span>
      {hint && <span className="truncate text-2xs text-muted">{hint}</span>}
    </div>
  )
}
