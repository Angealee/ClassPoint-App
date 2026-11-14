import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/*
 * The summary plate that opens a peer-evaluation screen: the one figure that answers "where do I
 * stand", an optional progress bar and a line of facts. It is the same fixed dark plate as Home,
 * Attendance and the leaderboard, so it never flips with the theme and never takes a lit edge
 * (a lit edge would vanish for light-mode users on a plate that stays dark).
 */
export function PeerPlate({
  eyebrow,
  figure,
  unit,
  progress,
  progressLabel,
  meta,
  right,
  children,
  className,
}: {
  eyebrow: string
  /** The big number (or a short phrase like "All done"). */
  figure: string
  unit?: string
  /** 0 to 1. Omit for no bar. */
  progress?: number | null
  progressLabel?: string
  meta?: ReactNode
  right?: ReactNode
  /** Anything that belongs on the plate under the figure, set off by a hairline. */
  children?: ReactNode
  className?: string
}) {
  const pct = progress == null ? null : Math.max(0, Math.min(1, progress))
  const wordy = figure.length > 3

  return (
    <div
      className={cn(
        'overflow-hidden rounded-2xl bg-gradient-to-br from-plate-2 to-plate p-5 text-white shadow-lg shadow-black/25 ring-1 ring-white/10',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-2xs font-semibold uppercase tracking-widest text-white/55">{eyebrow}</p>
        {right}
      </div>

      <div className="mt-2 flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1">
        <p
          className={cn(
            'font-display font-bold leading-none tabular-nums',
            wordy ? 'text-4xl' : 'text-5xl',
          )}
        >
          {figure}
        </p>
        {unit && <p className="mb-1 text-sm font-medium text-white/70">{unit}</p>}
      </div>

      {pct !== null && (
        <div
          role="progressbar"
          aria-label={progressLabel ?? 'Progress'}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct * 100)}
          className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15"
        >
          <div
            className="h-full origin-left rounded-full bg-gold-300"
            style={{ transform: `scaleX(${pct})` }}
          />
        </div>
      )}

      {meta && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-white/70">
          {meta}
        </p>
      )}

      {children && <div className="mt-4 border-t border-white/10 pt-4">{children}</div>}
    </div>
  )
}
