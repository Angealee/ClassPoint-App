import { motion } from 'framer-motion'
import { FlameIcon, ScanIcon } from '@/components/ui/icons'
import { rateTone, trailKind, type AttendanceTally, type TrailKind } from '@/lib/attendance'
import { glide } from '@/lib/motion'
import { cn } from '@/lib/cn'
import type { AttendanceStatus } from '@/lib/types'

/*
 * The attendance hero: the same fixed dark plate as Home, Grades and the leaderboard. It leads
 * with the RATE and the PATTERN (a trail of your last classes), not three equal totals, because
 * the pattern is what a student can still change. The rate is plain white on purpose: colour
 * here means "below the instructor's at-risk line" and appears only as a chip when it applies.
 * Every value is a literal: the plate does not follow the theme.
 */
const DOT: Record<TrailKind, string> = {
  present: 'bg-plate-up',
  late: 'bg-gold-300',
  absent: 'bg-plate-down',
  neutral: 'border-2 border-white/50',
}

const KIND_LABEL: Record<TrailKind, string> = {
  present: 'present',
  late: 'late',
  absent: 'absent',
  neutral: 'excused or irregular',
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function AttendancePlate({
  scopeLabel,
  stats,
  trail,
  streak,
  reduced,
  onPickClass,
  onStats,
  onScan,
}: {
  scopeLabel: string
  stats: AttendanceTally
  trail: Array<{ recordId: string; status: AttendanceStatus; startedAt: string }>
  streak: number | null
  reduced: boolean
  onPickClass: (recordId: string) => void
  onStats: () => void
  /** Present only when nothing is live and the semester is open: the live bar owns scanning then. */
  onScan?: () => void
}) {
  const below = stats.counted > 0 && rateTone(stats.rate) === 'danger'
  const lit = streak !== null && streak >= 1
  const hot = streak !== null && streak >= 5

  return (
    <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-plate-2 to-plate p-5 text-white shadow-lg shadow-black/25 ring-1 ring-white/10">
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs font-semibold uppercase tracking-widest text-white/55">
          Attendance · {scopeLabel}
        </p>
        {onScan && (
          <button
            type="button"
            onClick={onScan}
            className="cp-tap-y -mr-1 -mt-1.5 inline-flex h-9 items-center gap-1.5 rounded-lg bg-white/10 px-3 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <ScanIcon className="h-4 w-4" aria-hidden />
            Scan
          </button>
        )}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-end gap-x-3 gap-y-1.5">
          <p className="font-display text-5xl font-bold leading-none tabular-nums">
            {stats.counted === 0 ? <span className="text-white/40">-</span> : `${stats.rate}%`}
          </p>
          {below && (
            <span className="mb-1 inline-flex items-center rounded-lg bg-plate-down/15 px-2 py-0.5 text-xs font-bold text-plate-down">
              Below 70%
            </span>
          )}
        </div>

        {streak !== null && (
          <p
            title={lit ? `${streak} classes in a row, all present` : 'No streak yet'}
            className={cn(
              'flex shrink-0 items-center gap-1.5 pb-1 text-sm font-bold tabular-nums',
              lit ? 'text-white' : 'text-white/50',
            )}
          >
            <FlameIcon
              aria-hidden
              className={cn(
                'h-5 w-5',
                hot ? 'cp-flame text-plate-hot' : lit ? 'text-plate-hot' : 'opacity-40',
              )}
            />
            {lit ? (
              <span>
                {streak}
                <span className="ml-1 text-xs font-medium text-white/60">in a row</span>
              </span>
            ) : (
              <span className="text-xs font-medium">No streak</span>
            )}
          </p>
        )}
      </div>

      {trail.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-2xs text-white/55">
            Your last {trail.length} class{trail.length === 1 ? '' : 'es'}
          </p>
          <div className="flex gap-1">
            {trail.map((c, i) => {
              const kind = trailKind(c.status)
              return (
                <motion.button
                  key={c.recordId}
                  type="button"
                  onClick={() => onPickClass(c.recordId)}
                  initial={reduced ? false : { opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ ...glide, delay: 0.04 * i }}
                  title={`${when(c.startedAt)}: ${KIND_LABEL[kind]}`}
                  aria-label={`${when(c.startedAt)}, ${KIND_LABEL[kind]}. Show in the log.`}
                  className={cn(
                    'h-5 w-5 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                    DOT[kind],
                  )}
                />
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3">
        <p className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/70">
          <Count n={stats.present} label="present" dot="bg-plate-up" />
          <Count n={stats.late} label="late" dot="bg-gold-300" />
          <Count n={stats.absent} label="absent" dot="bg-plate-down" />
          {stats.neutral > 0 && (
            <Count n={stats.neutral} label="excused" dot="border-2 border-white/50" />
          )}
        </p>
        <button
          type="button"
          onClick={onStats}
          className="cp-tap-y shrink-0 text-sm font-semibold text-white/80 transition-colors hover:text-white focus:outline-none focus-visible:underline"
        >
          Stats ›
        </button>
      </div>
    </div>
  )
}

function Count({ n, label, dot }: { n: number; label: string; dot: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      <span aria-hidden className={cn('h-2 w-2 rounded-full', dot)} />
      <span className="font-semibold text-white">{n}</span> {label}
    </span>
  )
}
