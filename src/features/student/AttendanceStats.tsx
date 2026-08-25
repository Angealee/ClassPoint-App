import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { STATUS_META } from '@/components/attendance/StatusChip'
import { groupByTerm, groupByWeek, termLabel } from '@/lib/term'
import { NEUTRAL_STATUSES } from '@/lib/types'
import { cn } from '@/lib/cn'
import type { MyAttendanceEntry } from '@/lib/types'
import { useStudentData } from './StudentData'

/** present + late + absent. Neutral statuses are excluded everywhere by rule. */
function counted(items: MyAttendanceEntry[]): number {
  return items.filter((h) => !NEUTRAL_STATUSES.includes(h.status)).length
}

/** Show-up rate: present or late, over the classes that counted. */
function rateOf(items: MyAttendanceEntry[]): number {
  const c = counted(items)
  if (c === 0) return 0
  const showed = items.filter((h) => h.status === 'present' || h.status === 'late').length
  return Math.round((showed / c) * 100)
}

/**
 * The detailed attendance read.
 *
 * Split from the Attendance tab on purpose: that screen is for DOING things —
 * scan, resolve an absence, check a recent mark. This one answers "how am I
 * actually going?", which needs cuts the tab has no room for.
 *
 * Reads attendance from StudentData rather than fetching its own, so arriving
 * from the Dashboard teaser is instant and an instructor's correction reaches
 * both surfaces from the one subscription.
 */
export function AttendanceStats() {
  const navigate = useNavigate()
  const { attendance, attendanceLoading, achievementProgress } = useStudentData()

  /** Per-term rates. Terms are what actually get graded. */
  const terms = useMemo(
    () =>
      groupByTerm(attendance, (h) => h.startedAt)
        .filter((g) => g.items.length > 0)
        .map((g) => ({
          key: g.label,
          label: g.term ? termLabel(g.term) : 'Outside term',
          rate: rateOf(g.items),
          counted: counted(g.items),
          absent: g.items.filter((h) => h.status === 'absent').length,
        })),
    [attendance],
  )

  /** Per-week attendance, oldest first, for the trend chart. */
  const weeks = useMemo(
    () =>
      groupByWeek(attendance, (h) => h.startedAt)
        .map((g) => ({ week: g.week, rate: rateOf(g.items), counted: counted(g.items) }))
        .filter((w) => w.counted > 0)
        .sort((a, b) => a.week - b.week),
    [attendance],
  )

  /**
   * Punctuality, from check-in time against when class actually started.
   *
   * Only rows with a `scannedAt` count: a record the instructor marked by hand
   * has no check-in moment, and averaging it in as "0 minutes" would invent a
   * punctuality the student never demonstrated.
   */
  const punctuality = useMemo(() => {
    const scanned = attendance.filter((h) => h.scannedAt && !NEUTRAL_STATUSES.includes(h.status))
    if (scanned.length === 0) return null
    const mins = scanned.map((h) =>
      Math.max(0, (new Date(h.scannedAt as string).getTime() - new Date(h.startedAt).getTime()) / 60000),
    )
    const avg = mins.reduce((a, b) => a + b, 0) / mins.length
    // "On the dot" = inside the first two minutes, matching the early-streak rule.
    return {
      avg: Math.round(avg * 10) / 10,
      onTheDot: mins.filter((m) => m <= 2).length,
      total: scanned.length,
      best: Math.round(Math.min(...mins) * 10) / 10,
    }
  }, [attendance])

  const overall = useMemo(() => rateOf(attendance), [attendance])
  const streak = achievementProgress?.present_streak ?? null

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/app')}
          aria-label="Back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line text-muted transition-colors hover:text-ink"
        >
          &lsaquo;
        </button>
        <div>
          <h1 className="font-display text-xl font-bold">Attendance stats</h1>
          <p className="text-[13px] text-muted">How your semester is actually going.</p>
        </div>
      </div>

      {attendanceLoading ? (
        <ListSkeleton rows={5} />
      ) : attendance.length === 0 ? (
        <Card className="p-8 text-center text-[15px] text-muted">
          No classes yet. Once you have checked in a few times, your stats appear here.
        </Card>
      ) : (
        <>
          {/* Headline */}
          <Card className="p-5 text-center">
            <p className="font-display text-5xl font-bold tabular-nums">{overall}%</p>
            <p className="mt-1 text-[13px] text-muted">
              Show-up rate across {counted(attendance)} classes
              {streak !== null && streak > 0 && ` · ${streak} in a row`}
            </p>
          </Card>

          {/* Per term */}
          {terms.length > 0 && (
            <div>
              <h2 className="mb-2 px-1 text-[15px] font-semibold text-muted">By term</h2>
              <Card className="divide-y divide-line p-0">
                {terms.map((t) => (
                  <div key={t.key} className="px-4 py-3.5">
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">
                        {t.label}
                      </span>
                      <span className="font-display text-base font-bold tabular-nums">
                        {t.rate}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-card-2">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${t.rate}%` }}
                        transition={{ duration: 0.5, ease: 'easeOut' }}
                        className="h-full rounded-full bg-brand-500"
                      />
                    </div>
                    <p className="mt-1.5 text-[13px] text-muted">
                      {t.counted} class{t.counted === 1 ? '' : 'es'}
                      {t.absent > 0 && ` · ${t.absent} absent`}
                    </p>
                  </div>
                ))}
              </Card>
            </div>
          )}

          {/* Weekly trend */}
          {weeks.length > 1 && (
            <div>
              <h2 className="mb-2 px-1 text-[15px] font-semibold text-muted">Week by week</h2>
              <Card className="p-4">
                <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
                  {weeks.map((w) => (
                    <div key={w.week} className="flex min-w-7 flex-1 flex-col items-center gap-1">
                      <span className="text-[12px] font-semibold tabular-nums text-muted">
                        {w.rate}
                      </span>
                      <div className="flex h-20 w-full items-end">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${Math.max(w.rate, 3)}%` }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                          className={cn(
                            'w-full rounded-t',
                            w.rate >= 75
                              ? 'bg-emerald-500'
                              : w.rate >= 50
                                ? 'bg-gold-400'
                                : 'bg-brand-500',
                          )}
                        />
                      </div>
                      <span className="text-[12px] tabular-nums text-muted/70">{w.week}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-center text-[12px] text-muted/70">Class week · % attended</p>
              </Card>
            </div>
          )}

          {/* Punctuality */}
          {punctuality && (
            <div>
              <h2 className="mb-2 px-1 text-[15px] font-semibold text-muted">Punctuality</h2>
              <Card className="p-0">
                <div className="grid grid-cols-3 divide-x divide-line">
                  <div className="flex flex-col items-center justify-center py-4">
                    <p className="font-display text-2xl font-bold tabular-nums">{punctuality.avg}</p>
                    <p className="mt-0.5 text-center text-[13px] text-muted">min after start</p>
                  </div>
                  <div className="flex flex-col items-center justify-center py-4">
                    <p
                      className={cn(
                        'font-display text-2xl font-bold tabular-nums',
                        STATUS_META.present.text,
                      )}
                    >
                      {punctuality.onTheDot}
                    </p>
                    <p className="mt-0.5 text-center text-[13px] text-muted">on the dot</p>
                  </div>
                  <div className="flex flex-col items-center justify-center py-4">
                    <p className="font-display text-2xl font-bold tabular-nums">
                      {punctuality.best}
                    </p>
                    <p className="mt-0.5 text-center text-[13px] text-muted">fastest</p>
                  </div>
                </div>
                <p className="border-t border-line px-4 py-3 text-[13px] text-muted">
                  Measured from {punctuality.total} scanned check-in
                  {punctuality.total === 1 ? '' : 's'}. Classes your instructor marked by hand are
                  not counted — there is no scan time to measure.
                </p>
              </Card>
            </div>
          )}

          <Button variant="outline" className="w-full" onClick={() => navigate('/app/attendance')}>
            See full history
          </Button>
        </>
      )}
    </div>
  )
}
