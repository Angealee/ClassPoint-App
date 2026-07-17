import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Avatar } from '@/components/ui/Avatar'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { ArrowLeftIcon, DownloadIcon, WarningIcon } from '@/components/ui/icons'
import { getAttendanceAnalytics, listSessions } from '@/lib/api'
import { exportAttendanceSummary } from '@/lib/attendance-io'
import { groupByWeek, weekOf } from '@/lib/term'
import { cn } from '@/lib/cn'
import { useInstructor } from './InstructorLayout'
import type { AttendanceAnalytics, SessionSummary, StudentAttendanceStat } from '@/lib/types'

type SortKey = 'name' | 'rate' | 'absent'

/** Students at/below this rate, or at/above this many absences, get flagged. */
const AT_RISK_RATE = 0.7
const AT_RISK_ABSENCES = 3

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const pct = (rate: number | null) => (rate === null ? '—' : `${Math.round(rate * 100)}%`)

/** Green ≥85%, gold ≥70%, red below — same language as the status chips. */
function rateTone(rate: number | null): string {
  if (rate === null) return 'text-muted'
  if (rate >= 0.85) return 'text-emerald-600 dark:text-emerald-400'
  if (rate >= AT_RISK_RATE) return 'text-gold-600 dark:text-gold-400'
  return 'text-brand-600 dark:text-brand-400'
}

/** The whole term at a glance: every session, plus who's actually showing up. */
export function SessionHistory() {
  const { sections, selectedSectionId, setSelectedSectionId } = useInstructor()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [analytics, setAnalytics] = useState<AttendanceAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortKey>('rate')

  const sectionName = sections.find((s) => s.id === selectedSectionId)?.name ?? ''

  const load = useCallback(async () => {
    if (!selectedSectionId) return
    setLoading(true)
    try {
      const [list, stats] = await Promise.all([
        listSessions(selectedSectionId),
        getAttendanceAnalytics(selectedSectionId),
      ])
      setSessions(list)
      setAnalytics(stats)
    } catch {
      toast('Could not load history.', 'error')
    } finally {
      setLoading(false)
    }
  }, [selectedSectionId, toast])

  useEffect(() => {
    void load()
  }, [load])

  const weeks = useMemo(() => groupByWeek(sessions, (s) => s.startedAt), [sessions])

  /** Class-wide show-up rate per week — the trend sparkline's data. */
  const trend = useMemo(() => {
    const byWeek = new Map<number, { attended: number; counted: number }>()
    for (const s of sessions) {
      if (s.status === 'active') continue
      const w = weekOf(s.startedAt)
      const acc = byWeek.get(w) ?? { attended: 0, counted: 0 }
      acc.attended += s.present + s.late
      acc.counted += s.present + s.late + s.absent // neutral statuses excluded
      byWeek.set(w, acc)
    }
    return [...byWeek.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, v]) => ({ week, rate: v.counted > 0 ? v.attended / v.counted : null }))
  }, [sessions])

  const ranked = useMemo(() => {
    const list = [...(analytics?.students ?? [])]
    if (sort === 'name') return list.sort((a, b) => a.fullName.localeCompare(b.fullName))
    if (sort === 'absent') return list.sort((a, b) => b.absent - a.absent)
    // Rate ascending — the students who need attention float to the top.
    return list.sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2))
  }, [analytics, sort])

  const atRisk = useMemo(
    () =>
      (analytics?.students ?? []).filter(
        (s) => s.counted > 0 && (s.absent >= AT_RISK_ABSENCES || (s.rate ?? 1) <= AT_RISK_RATE),
      ),
    [analytics],
  )

  async function onExport() {
    if (!analytics) return
    try {
      await exportAttendanceSummary(sectionName, analytics.students)
    } catch {
      toast('Could not export.', 'error')
    }
  }

  return (
    <div className="space-y-5 pb-4">
      <button
        type="button"
        onClick={() => navigate('/teach/attendance')}
        className="flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
      >
        <ArrowLeftIcon className="h-4 w-4" /> Attendance
      </button>

      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold">Class history</h1>
          <p className="text-sm text-muted">Every session, and who’s showing up.</p>
        </div>
        <Select
          aria-label="Section"
          value={selectedSectionId}
          onChange={(e) => setSelectedSectionId(e.target.value)}
          className="max-w-32 font-display font-bold ring-1 ring-brand-500/40"
        >
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : sessions.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          No sessions yet. Start a class to build history.
        </Card>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="grid grid-cols-3 gap-2">
            <Card className="p-3 text-center">
              <p className="font-display text-xl font-bold tabular-nums">{sessions.length}</p>
              <p className="text-[0.7rem] text-muted">Sessions</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="font-display text-xl font-bold tabular-nums text-brand-500">
                {analytics?.penaltyPoints ?? 0}
              </p>
              <p className="text-[0.7rem] text-muted">Points deducted</p>
            </Card>
            <Card className="p-3 text-center">
              <p className="font-display text-xl font-bold tabular-nums">
                {analytics?.penalizedStudents ?? 0}
              </p>
              <p className="text-[0.7rem] text-muted">Students hit</p>
            </Card>
          </div>

          {/* Weekly trend */}
          {trend.length > 1 && (
            <Card className="p-5">
              <p className="font-display font-bold">Weekly show-up rate</p>
              <p className="mb-3 text-xs text-muted">
                Present + late, out of the sessions that counted.
              </p>
              <TrendBars data={trend} />
            </Card>
          )}

          {/* Needs attention */}
          {atRisk.length > 0 && (
            <Card className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500">
                  <WarningIcon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="font-display font-bold">Needs attention</p>
                  <p className="text-xs text-muted">
                    {AT_RISK_ABSENCES}+ absences, or {Math.round(AT_RISK_RATE * 100)}% and below.
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {atRisk.map((s) => (
                  <div key={s.studentId} className="flex items-center gap-3">
                    <Avatar name={s.fullName} url={s.avatarUrl} className="h-8 w-8" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.fullName}</span>
                    <span className="shrink-0 text-xs text-muted">{s.absent} absent</span>
                    <span
                      className={cn('shrink-0 text-sm font-bold tabular-nums', rateTone(s.rate))}
                    >
                      {pct(s.rate)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Per-student table */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <h2 className="text-sm font-semibold text-muted">Per student</h2>
              <div className="flex gap-1">
                {(
                  [
                    ['rate', 'Rate'],
                    ['absent', 'Absences'],
                    ['name', 'Name'],
                  ] as Array<[SortKey, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSort(key)}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors',
                      sort === key ? 'bg-brand-500/10 text-brand-500' : 'text-muted hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <Card className="divide-y divide-line">
              {ranked.map((s) => (
                <StudentRow key={s.studentId} stat={s} />
              ))}
            </Card>
            <p className="mt-2 px-1 text-xs text-muted">
              Rate = present + late, out of sessions that counted. Excused and irregular sessions
              are left out entirely.
            </p>
          </div>

          <Button variant="outline" className="w-full" onClick={onExport}>
            <DownloadIcon className="h-5 w-5" /> Export summary to Excel
          </Button>

          {/* Sessions by week */}
          <div>
            <h2 className="mb-2 px-1 text-sm font-semibold text-muted">All sessions</h2>
            <div className="space-y-4">
              {weeks.map((w) => (
                <div key={w.week}>
                  <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                    {w.label}
                  </p>
                  <Card className="divide-y divide-line">
                    {w.items.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => navigate(`/teach/attendance/session/${s.id}`)}
                        className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-card-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">
                            {s.topic || shortDate(s.startedAt)}
                          </p>
                          <p className="text-xs text-muted">
                            {shortDate(s.startedAt)}
                            {s.status === 'active'
                              ? ' · live now'
                              : !s.penaltiesCommitted
                                ? ' · not finalised'
                                : ''}
                          </p>
                        </div>
                        <SessionTally s={s} />
                      </button>
                    ))}
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StudentRow({ stat }: { stat: StudentAttendanceStat }) {
  const neutral = stat.excused + stat.irregular
  return (
    <div className="flex items-center gap-3 p-3">
      <Avatar name={stat.fullName} url={stat.avatarUrl} className="h-9 w-9" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{stat.fullName}</p>
        <p className="text-xs text-muted">
          {stat.present} present · {stat.late} late · {stat.absent} absent
          {neutral > 0 && ` · ${neutral} not counted`}
        </p>
      </div>
      <p className={cn('shrink-0 font-display text-base font-bold tabular-nums', rateTone(stat.rate))}>
        {pct(stat.rate)}
      </p>
    </div>
  )
}

function SessionTally({ s }: { s: SessionSummary }) {
  return (
    <div className="flex shrink-0 items-center gap-2 text-xs font-semibold tabular-nums">
      <span className="text-emerald-600 dark:text-emerald-400">{s.present}</span>
      <span className="text-gold-600 dark:text-gold-400">{s.late}</span>
      <span className="text-brand-600 dark:text-brand-400">{s.absent}</span>
      {s.excused + s.irregular > 0 && (
        <span className="text-muted">+{s.excused + s.irregular}</span>
      )}
    </div>
  )
}

/** Tallest a bar can be, in px. The track is explicitly this tall. */
const TRACK_H = 72
/** A 0% week still shows a visible stub, so "we measured zero" reads as data. */
const MIN_BAR_H = 3

/**
 * Inline bar chart of weekly show-up rate. Hand-drawn with divs — a chart
 * library would cost more bundle than this whole page.
 *
 * Bar heights are in px, not %: a percentage height only resolves against a
 * parent with a *definite* height, and a flex track sized by `flex-1` inside an
 * auto-height column isn't definite — the bars silently collapse to nothing.
 */
function TrendBars({ data }: { data: Array<{ week: number; rate: number | null }> }) {
  return (
    <div className="flex items-end gap-2">
      {data.map(({ week, rate }) => (
        <div key={week} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
          <span className="text-[0.65rem] font-semibold tabular-nums text-muted">
            {rate === null ? '–' : `${Math.round(rate * 100)}%`}
          </span>
          <div
            className="flex w-full items-end rounded-md bg-card-2"
            style={{ height: TRACK_H }}
            title={`Week ${week}: ${pct(rate)}`}
          >
            <div
              className={cn(
                'w-full rounded-md transition-[height]',
                rate === null
                  ? 'bg-line'
                  : rate >= 0.85
                    ? 'bg-emerald-500'
                    : rate >= AT_RISK_RATE
                      ? 'bg-gold-400'
                      : 'bg-brand-500',
              )}
              style={{ height: Math.max(MIN_BAR_H, (rate ?? 0) * TRACK_H) }}
            />
          </div>
          <span className="text-[0.65rem] tabular-nums text-muted">W{week}</span>
        </div>
      ))}
    </div>
  )
}
