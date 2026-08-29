import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import { TONE } from '@/lib/tone'
import type { PointEvent } from '@/lib/types'

/**
 * One row of the points ledger.
 *
 * ── WHY THIS IS SHARED ─────────────────────────────────────────────────────
 * The Dashboard's `FeedRow` and PointsHistory's `LedgerRow` were the same
 * component twice, differing only in the badge geometry (h-10 rounded-xl versus
 * h-9 w-11 rounded-lg). That looks harmless and is not: when brand red was
 * demoted in Era 6.0, the "activity" category was fixed in one twin and missed
 * in the other, so the same event rendered in two different colours depending
 * on which screen you were looking at.
 *
 * ── THE CATEGORY COLOURS ───────────────────────────────────────────────────
 * A negative row is DANGER — it is the only place a student loses something.
 * "activity" is ACCENT (brand red as positive identity, not as a warning), and
 * everything else is REWARD gold. `redeem` rows are negative and therefore land
 * on danger, which is correct: spending really does lower your level and rank.
 */
export function PointEventRow({
  event: e,
  compact = false,
}: {
  event: PointEvent
  /** Narrower badge, for the denser full-ledger list. */
  compact?: boolean
}) {
  const negative = e.points < 0
  const tone = negative ? 'danger' : e.category === 'activity' ? 'accent' : 'reward'

  return (
    <div className="flex items-center gap-3 p-4">
      <span
        className={cn(
          'flex shrink-0 items-center justify-center font-display font-bold tabular-nums',
          compact ? 'h-9 w-11 rounded-lg text-sm' : 'h-10 w-10 rounded-xl text-sm',
          TONE[tone].chip,
        )}
      >
        {negative ? e.points : `+${e.points}`}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {e.note ?? (negative ? 'Deduction' : 'Class points')}
        </p>
        <p className="text-xs capitalize text-muted">
          {e.category} · {timeAgo(e.created_at)}
        </p>
      </div>
    </div>
  )
}
