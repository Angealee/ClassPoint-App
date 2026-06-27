import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import type { PointEvent } from '@/lib/types'

/**
 * "While you were away" recap — shown once on app open when the student received
 * points or penalties while the app was closed. Summarises the net change and
 * lists each missed award/penalty.
 */
export function AwayRecap({ events, onClose }: { events: PointEvent[]; onClose: () => void }) {
  const open = events.length > 0
  const net = events.reduce((sum, e) => sum + e.points, 0)
  const positive = net >= 0

  return (
    <Sheet open={open} onClose={onClose} title="While you were away">
      <div className="space-y-4">
        <div
          className={cn(
            'rounded-2xl border p-4 text-center',
            positive ? 'border-gold-400/40 bg-gold-400/10' : 'border-red-500/30 bg-red-500/10',
          )}
        >
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
            Score change
          </p>
          <p
            className={cn(
              'font-display text-4xl font-bold',
              positive ? 'text-gold-600 dark:text-gold-400' : 'text-red-500',
            )}
          >
            {net >= 0 ? `+${net}` : net}
          </p>
          <p className="text-sm text-muted">
            {events.length} update{events.length > 1 ? 's' : ''} since you were last here
          </p>
        </div>

        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {events.map((e) => {
            const negative = e.points < 0
            return (
              <div key={e.id} className="flex items-center gap-3 p-3">
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold',
                    negative
                      ? 'bg-red-500/10 text-red-500'
                      : e.category === 'activity'
                        ? 'bg-brand-500/10 text-brand-500'
                        : 'bg-gold-400/15 text-gold-600 dark:text-gold-400',
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
          })}
        </div>
      </div>

      <Button size="lg" className="mt-5 w-full" onClick={onClose}>
        {positive ? 'Okie!' : 'lesgoo'}
      </Button>
    </Sheet>
  )
}
