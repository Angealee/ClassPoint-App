import { cn } from '@/lib/cn'
import { TONE, type ToneName } from '@/lib/tone'

/**
 * A plain proportion bar — show-up rate, badge progress, a term's attendance.
 *
 * NOT a replacement for `XpBar`, which is deliberately different: that one is
 * the gold hero bar with a spring animation and a shimmer, and it earns its
 * weight because it is the screen's focal point. This one is a hairline track
 * with no motion, for the places that need a proportion read at a glance in a
 * list of ten others.
 *
 * Carries the progressbar ARIA that the hand-rolled track/fill divs did not.
 */
export function Meter({
  value,
  max = 100,
  tone = 'success',
  size = 'md',
  label,
  className,
}: {
  value: number
  max?: number
  tone?: ToneName
  size?: 'sm' | 'md'
  /** Accessible name — what the proportion is OF. */
  label?: string
  className?: string
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100))

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'w-full overflow-hidden rounded-full bg-card-2',
        size === 'sm' ? 'h-1.5' : 'h-2',
        className,
      )}
    >
      <div
        className={cn('h-full rounded-full transition-[width]', TONE[tone].dot)}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
