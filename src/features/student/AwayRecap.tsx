import { PointEventRow } from '@/components/points/PointEventRow'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
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
            positive ? 'border-gold-400/40 bg-gold-400/10' : 'border-danger-solid/30 bg-danger-solid/10',
          )}
        >
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted">
            Score change
          </p>
          <p
            className={cn(
              'font-display text-4xl font-bold',
              positive ? 'text-reward' : 'text-danger',
            )}
          >
            {net >= 0 ? `+${net}` : net}
          </p>
          <p className="text-sm text-muted">
            {events.length} update{events.length > 1 ? 's' : ''} since you were last here
          </p>
        </div>

        <div className="divide-y divide-line overflow-hidden rounded-xl border border-line">
          {events.map((e) => (
            <PointEventRow key={e.id} event={e} compact />
          ))}
        </div>
      </div>

      <Button size="lg" className="mt-5 w-full" onClick={onClose}>
        {positive ? 'Okie!' : 'lesgoo'}
      </Button>
    </Sheet>
  )
}
