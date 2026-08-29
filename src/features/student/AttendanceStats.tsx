import { SectionLabel } from '@/components/ui/SectionLabel'
import { EmptyState } from '@/components/ui/EmptyState'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { STATUS_META } from '@/components/attendance/StatusChip'
import { groupByTerm, groupByWeek, termLabel } from '@/lib/term'
import { bySubject, countedOf as counted, counts, rateOf, rateTone, tally } from '@/lib/attendance'
import { Rows } from '@/components/ui/Card'
import { Meter } from '@/components/ui/Meter'
import { TONE } from '@/lib/tone'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/ui/PageHeader'
import { useStudentData } from './StudentData'


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
    const scanned = attendance.filter((h) => h.scannedAt && counts(h.status))
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
  const subjects = useMemo(() => bySubject(attendance), [attendance])
  const { neutral, excused, irregular } = useMemo(() => tally(attendance), [attendance])
  const streak = achievementProgress?.present_streak ?? null

  return (
    <div className="space-y-5">
      {/* Arriving here from the Attendance tab now returns there, not to Home. */}
      <PageHeader
        title="Attendance stats"
        subtitle="How your semester is actually going."
        fallback="/app/attendance"
      />

      {attendanceLoading ? (
        <ListSkeleton rows={5} />
      ) : attendance.length === 0 ? (
        <EmptyState>No classes yet. Once you have checked in a few times, your stats appear here.</EmptyState>
      ) : (
        <>
          {/* Headline */}
          <Card pad="roomy" className="text-center">
            <p
              className={cn(
                'font-display text-5xl font-bold tabular-nums',
                TONE[rateTone(overall)].text,
              )}
            >
              {overall}%
            </p>
            <p className="mt-1 text-sm text-muted">
              Show-up rate across {counted(attendance)} classes
              {streak !== null && streak > 0 && ` · ${streak} in a row`}
            </p>
            {/* Moved here from the Attendance tab, where it sat as a loose line
                under the summary with nothing to relate it to. This is the
                screen that explains the rate, so the exclusion belongs here. */}
            {neutral > 0 && (
              <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
                {excused > 0 && `${excused} excused`}
                {excused > 0 && irregular > 0 && ' · '}
                {irregular > 0 && `${irregular} irregular`} — those classes don't count for or
                against you.
              </p>
            )}
          </Card>

          {/* Per subject (0030). Attendance is subject-scoped, so a perfect
              record in one class shouldn't be averaged away by a rough one in
              another. Only worth showing once there IS more than one. */}
          {subjects.length > 1 && (
            <div>
              <SectionLabel>By subject</SectionLabel>
              <Rows>
                {subjects.map((sub) => (
                  <div key={sub.key} className="px-4 py-3.5">
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {sub.label}
                      </span>
                      <span className="font-display text-base font-bold tabular-nums">
                        {sub.rate}%
                      </span>
                    </div>
                    <Meter
                      value={sub.rate}
                      tone={rateTone(sub.rate)}
                      size="sm"
                      label={`${sub.label} show-up rate`}
                      className="mt-2"
                    />
                    <p className="mt-1.5 text-sm text-muted">
                      {sub.counted} class{sub.counted === 1 ? '' : 'es'}
                      {sub.absent > 0 && ` · ${sub.absent} absent`}
                    </p>
                  </div>
                ))}
              </Rows>
            </div>
          )}

          {/* Per term */}
          {terms.length > 0 && (
            <div>
              <SectionLabel>By term</SectionLabel>
              <Rows>
                {terms.map((t) => (
                  <div key={t.key} className="px-4 py-3.5">
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {t.label}
                      </span>
                      <span className="font-display text-base font-bold tabular-nums">
                        {t.rate}%
                      </span>
                    </div>
                    <Meter
                      value={t.rate}
                      tone={rateTone(t.rate)}
                      size="sm"
                      label={`${t.label} show-up rate`}
                      className="mt-2"
                    />
                    <p className="mt-1.5 text-sm text-muted">
                      {t.counted} class{t.counted === 1 ? '' : 'es'}
                      {t.absent > 0 && ` · ${t.absent} absent`}
                    </p>
                  </div>
                ))}
              </Rows>
            </div>
          )}

          {/* Weekly trend */}
          {weeks.length > 1 && (
            <div>
              <SectionLabel>Week by week</SectionLabel>
              <Card className="p-4">
                <div className="flex items-end gap-1.5 overflow-x-auto pb-1">
                  {weeks.map((w) => (
                    <div key={w.week} className="flex min-w-7 flex-1 flex-col items-center gap-1">
                      <span className="text-xs font-semibold tabular-nums text-muted">
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
                              ? 'bg-success-solid'
                              : w.rate >= 50
                                ? 'bg-gold-400'
                                : 'bg-brand-500',
                          )}
                        />
                      </div>
                      <span className="text-xs tabular-nums text-muted/70">{w.week}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-center text-xs text-muted/70">Class week · % attended</p>
              </Card>
            </div>
          )}

          {/* Punctuality */}
          {punctuality && (
            <div>
              <SectionLabel>Punctuality</SectionLabel>
              <Card className="p-0">
                <div className="grid grid-cols-3 divide-x divide-line">
                  <div className="flex flex-col items-center justify-center py-4">
                    <p className="font-display text-2xl font-bold tabular-nums">{punctuality.avg}</p>
                    <p className="mt-0.5 text-center text-sm text-muted">min after start</p>
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
                    <p className="mt-0.5 text-center text-sm text-muted">on the dot</p>
                  </div>
                  <div className="flex flex-col items-center justify-center py-4">
                    <p className="font-display text-2xl font-bold tabular-nums">
                      {punctuality.best}
                    </p>
                    <p className="mt-0.5 text-center text-sm text-muted">fastest</p>
                  </div>
                </div>
                <p className="border-t border-line px-4 py-3 text-sm text-muted">
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
