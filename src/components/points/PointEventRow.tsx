import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import { TONE } from '@/lib/tone'
import type { PublicPointEvent } from '@/lib/types'

export function PointEventRow({
  event: e,
  compact = false,
}: {
  event: PublicPointEvent
  /** Narrower badge, for the denser full-ledger list. */
  compact?: boolean
}) {
  const negative = e.points < 0
  const tone = negative ? 'danger' : e.category === 'activity' ? 'accent' : 'reward'
  const categoryLabel = e.category === 'redeem' ? (negative ? 'spent' : 'refund') : e.category

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
          {categoryLabel} · {timeAgo(e.created_at)}
        </p>
      </div>
    </div>
  )
}
