import { motion, useReducedMotion } from 'framer-motion'
import { tap } from '@/lib/motion'
import { cn } from '@/lib/cn'

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
        key={String(given)}
        initial={reduce ? false : { scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={tap}
        className="font-display text-sm font-bold leading-none"
      >
        W
      </motion.span>
      <span className="tabular-nums">{count}</span>
    </button>
  )
}
