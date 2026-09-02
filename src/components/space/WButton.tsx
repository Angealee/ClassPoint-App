import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/cn'

/**
 * The scarce reaction. Three at a time, and un-giving one refunds it.
 *
 * A drawn letter rather than an icon: the reaction is called "a W", so the
 * glyph IS the word and there is nothing to decode. Gold when given, because
 * gold is already this app's colour for good things — points, XP, badges — and
 * a second "good" colour would dilute it.
 *
 * The count sits outside the tinted pill so a post at 0 does not render an
 * empty-looking badge, and `tabular-nums` keeps the button from reflowing as
 * the number changes under a spring.
 */
export function WButton({
  count,
  given,
  disabled,
  busy,
  onToggle,
}: {
  count: number
  given: boolean
  /** No Ws left, or you are muted / it is your own post. */
  disabled?: boolean
  busy?: boolean
  onToggle: () => void
}) {
  const reduce = useReducedMotion()

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || busy}
      aria-pressed={given}
      aria-label={given ? `Take back your W (${count})` : `Give a W (${count})`}
      className={cn(
        'flex items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 text-xs font-semibold transition-colors',
        given ? 'bg-reward-solid/15 text-reward' : 'bg-card-2 text-muted hover:text-ink',
        (disabled || busy) && 'cursor-not-allowed opacity-50',
      )}
    >
      <motion.span
        // Springs once per state flip, so giving a W feels like an action
        // rather than a checkbox. Keyed on `given` so it replays both ways.
        key={String(given)}
        initial={reduce ? false : { scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 600, damping: 16 }}
        className="font-display text-sm font-bold leading-none"
      >
        W
      </motion.span>
      <span className="tabular-nums">{count}</span>
    </button>
  )
}
