import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { StatusChip } from '@/components/attendance/StatusChip'
import { BadgeArt } from '@/components/achievements/BadgeArt'
import {
  ArrowLeftIcon,
  BoltIcon,
  DownloadIcon,
  KeyIcon,
  TrophyIcon,
} from '@/components/ui/icons'
import {
  archiveStudent,
  getMyAchievements,
  getMyRank,
  getStudent,
  listMyAttendance,
  listMyRedemptions,
  listStudentEvents,
  restoreStudent,
} from '@/lib/api'
import { getLevelProgress } from '@/lib/leveling'
import { groupByWeek, weekLabel } from '@/lib/term'
import { timeAgo } from '@/lib/time'
import { cn } from '@/lib/cn'
import { useInstructor } from './InstructorLayout'
import { ResetPinSheet } from './ResetPinSheet'
import type {
  AchievementState,
  InstructorStudentDetail,
  MyAttendanceEntry,
  PointEvent,
  Redemption,
} from '@/lib/types'

const NEUTRAL = new Set(['excused', 'irregular'])
const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** The instructor's full per-student record — and the launch point for the printable report. */
export function StudentRecord() {
  const { studentId = '' } = useParams()
  const navigate = useNavigate()
  const { sections } = useInstructor()
  const { toast } = useToast()

  const [student, setStudent] = useState<InstructorStudentDetail | null>(null)
  const [attendance, setAttendance] = useState<MyAttendanceEntry[]>([])
  const [events, setEvents] = useState<PointEvent[]>([])
  const [redemptions, setRedemptions] = useState<Redemption[]>([])
  const [achievements, setAchievements] = useState<AchievementState[]>([])
  const [rank, setRank] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [resetOpen, setResetOpen] = useState(false)
  const [archiveConfirm, setArchiveConfirm] = useState(false)
  const [archiving, setArchiving] = useState(false)

  const load = useCallback(async () => {
    if (!studentId) return
    setLoading(true)
    try {
      const s = await getStudent(studentId)
      if (!s) {
        setNotFound(true)
        return
      }
      setStudent(s)
      const [att, ev, red, ach, rk] = await Promise.all([
        listMyAttendance(studentId),
        listStudentEvents(studentId, 40),
        listMyRedemptions(studentId),
        getMyAchievements(studentId),
        getMyRank(studentId),
      ])
      setAttendance(att)
      setEvents(ev)
      setRedemptions(red)
      setAchievements(ach)
      setRank(rk)
    } catch {
      toast('Could not load this student.', 'error')
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [studentId, toast])

  useEffect(() => {
    void load()
  }, [load])

  const stats = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, counted: 0 }
    for (const a of attendance) {
      if (a.status === 'present') c.present++
      if (a.status === 'late') c.late++
      if (a.status === 'absent') c.absent++
      if (!NEUTRAL.has(a.status)) c.counted++
    }
    return { ...c, rate: c.counted ? Math.round(((c.present + c.late) / c.counted) * 100) : null }
  }, [attendance])

  const weeks = useMemo(() => groupByWeek(attendance, (a) => a.startedAt), [attendance])
  const unlocked = achievements.filter((a) => a.unlockedAt)
  const sectionName = sections.find((s) => s.id === student?.sectionId)?.name ?? ''

  async function onArchiveToggle() {
    if (!student) return
    setArchiving(true)
    try {
      if (student.archivedAt) {
        await restoreStudent(student.id)
        toast(`${student.fullName} restored.`, 'success')
      } else {
        await archiveStudent(student.id)
        toast(`${student.fullName} archived.`, 'success')
      }
      setArchiveConfirm(false)
      await load()
    } catch {
      toast('Could not update. Try again.', 'error')
    } finally {
      setArchiving(false)
    }
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate('/teach')} />
        <Card className="p-8 text-center text-sm text-muted">That student no longer exists.</Card>
      </div>
    )
  }

  if (loading || !student) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate('/teach')} />
        <Card className="h-28 animate-pulse bg-card-2" />
        <ListSkeleton rows={6} />
      </div>
    )
  }

  const level = getLevelProgress(student.lifetimePoints).level

  return (
    <div className="space-y-5 pb-4">
      <BackLink onClick={() => navigate('/teach')} />

      {student.archivedAt && (
        <Card className="border-brand-500/30 bg-brand-500/8 p-3 text-center text-sm font-medium text-brand-600 dark:text-brand-400">
          Archived — hidden from rosters and the leaderboard.
        </Card>
      )}

      {/* Header */}
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <Avatar name={student.fullName} url={student.avatarUrl} className="h-16 w-16 rounded-2xl" textClassName="text-2xl" />
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold">{student.fullName}</h1>
            <p className="text-sm text-muted">
              {sectionName}
              {student.username ? ` · @${student.username}` : ' · not claimed'}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="Points" value={String(student.lifetimePoints)} />
          <Stat label="Level" value={String(level)} />
          <Stat label="Rank" value={rank ? `#${rank}` : '—'} />
        </div>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => navigate(`/teach/student/${student.id}/report`)}>
          <DownloadIcon className="h-5 w-5" /> Print report
        </Button>
        <Button variant="outline" onClick={() => navigate(`/teach/award?student=${student.id}`)}>
          <BoltIcon className="h-5 w-5" /> Award
        </Button>
        {student.claimed && (
          <Button variant="outline" onClick={() => setResetOpen(true)}>
            <KeyIcon className="h-5 w-5" /> Reset PIN
          </Button>
        )}
        <Button
          variant="outline"
          className={cn(!student.claimed && 'col-span-2')}
          onClick={() => (student.archivedAt ? void onArchiveToggle() : setArchiveConfirm(true))}
        >
          {student.archivedAt ? 'Restore' : 'Archive'}
        </Button>
      </div>

      {/* Attendance */}
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-sm font-semibold text-muted">Attendance</h2>
          {stats.rate !== null && (
            <span className="text-sm font-bold tabular-nums text-brand-500">
              {stats.rate}% · {stats.present}P {stats.late}L {stats.absent}A
            </span>
          )}
        </div>
        {attendance.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted">No sessions yet.</Card>
        ) : (
          <div className="space-y-3">
            {weeks.map((w) => (
              <div key={w.week}>
                <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  {weekLabel(w.week)}
                </p>
                <Card className="divide-y divide-line">
                  {w.items.map((a) => (
                    <div key={a.recordId} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {a.topic || shortDate(a.startedAt)}
                        </p>
                        <p className="flex items-center gap-1.5 text-xs text-muted">
                          {shortDate(a.startedAt)}
                          {a.syncedLate && (
                            <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[0.6rem] font-medium text-sky-600 dark:text-sky-400">
                              Offline
                            </span>
                          )}
                        </p>
                      </div>
                      <StatusChip status={a.status} />
                    </div>
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Achievements */}
      {unlocked.length > 0 && (
        <div>
          <h2 className="mb-2 flex items-center gap-1.5 px-1 text-sm font-semibold text-muted">
            <TrophyIcon className="h-4 w-4" /> {unlocked.length} achievement
            {unlocked.length === 1 ? '' : 's'}
          </h2>
          <Card className="flex flex-wrap gap-2 p-3">
            {unlocked.map((a) => (
              <BadgeArt
                key={a.code}
                code={a.code}
                category={a.category}
                state="unlocked"
                isTitleGrantor={!!a.titleText}
                size="sm"
              />
            ))}
          </Card>
        </div>
      )}

      {/* Points ledger */}
      <div>
        <h2 className="mb-2 px-1 text-sm font-semibold text-muted">Recent points</h2>
        {events.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted">No point activity yet.</Card>
        ) : (
          <Card className="divide-y divide-line">
            {events.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-3">
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg font-display text-sm font-bold tabular-nums',
                    e.points < 0
                      ? 'bg-brand-500/10 text-brand-500'
                      : 'bg-gold-400/15 text-gold-600 dark:text-gold-400',
                  )}
                >
                  {e.points < 0 ? e.points : `+${e.points}`}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm capitalize">{e.category}</p>
                  <p className="truncate text-xs text-muted">
                    {e.note ? `${e.note} · ` : ''}
                    {timeAgo(e.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* Redemptions */}
      {redemptions.length > 0 && (
        <div>
          <h2 className="mb-2 px-1 text-sm font-semibold text-muted">Point requests</h2>
          <Card className="divide-y divide-line">
            {redemptions.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-card-2 font-display text-sm font-bold tabular-nums">
                  {r.points}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm capitalize">
                    {r.kind}
                    {r.note ? ` · ${r.note}` : ''}
                  </p>
                  <p className="text-xs text-muted">{timeAgo(r.requestedAt)}</p>
                </div>
                <span className="shrink-0 text-xs font-semibold capitalize text-muted">
                  {r.status}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      <ResetPinSheet
        student={student ? { id: student.id, fullName: student.fullName, username: student.username } : null}
        open={resetOpen}
        onClose={() => setResetOpen(false)}
      />

      <ConfirmDialog
        open={archiveConfirm}
        title="Archive this student?"
        message={
          <>
            <span className="font-semibold text-ink">{student.fullName}</span> disappears from the
            roster, leaderboard and attendance-taking — everything is kept and restorable.
          </>
        }
        confirmLabel="Archive"
        busy={archiving}
        onConfirm={onArchiveToggle}
        onClose={() => setArchiveConfirm(false)}
      />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-card-2 py-2.5">
      <p className="font-display text-lg font-bold tabular-nums">{value}</p>
      <p className="text-[0.7rem] text-muted">{label}</p>
    </div>
  )
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
    >
      <ArrowLeftIcon className="h-4 w-4" /> Students
    </button>
  )
}
