import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar } from '@/components/ui/Avatar'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { STATUS_META } from '@/components/attendance/StatusChip'
import {
  commitAttendancePenalties,
  listSessionAttendance,
  setSessionApplyPenalties,
  updateAttendanceStatus,
} from '@/lib/api'
import { cn } from '@/lib/cn'
import type { AttendanceRosterRow, AttendanceStatus, ClassSession } from '@/lib/types'

const ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'excused', 'irregular']
/** The three that drive the headline tallies; the neutral pair is summarised. */
const TALLY_ORDER: AttendanceStatus[] = ['present', 'late', 'absent']

/** Post-class review: confirm/override each status, then commit penalties. */
export function AttendanceReview({
  session,
  sectionName,
  onDone,
}: {
  session: ClassSession
  sectionName: string
  onDone: () => void
}) {
  const { toast } = useToast()
  const [roster, setRoster] = useState<AttendanceRosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [apply, setApply] = useState(session.applyPenalties)
  const [committing, setCommitting] = useState(false)
  const [confirmCommit, setConfirmCommit] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setRoster(await listSessionAttendance(session.id, session.sectionId))
    } catch {
      toast('Could not load the roster.', 'error')
    } finally {
      setLoading(false)
    }
  }, [session.id, session.sectionId, toast])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const c: Record<AttendanceStatus, number> = {
      present: 0,
      late: 0,
      absent: 0,
      excused: 0,
      irregular: 0,
    }
    for (const r of roster) if (r.status) c[r.status] += 1
    return c
  }, [roster])
  const neutral = counts.excused + counts.irregular

  const deduction = apply
    ? counts.late * session.latePenalty + counts.absent * session.absentPenalty
    : 0

  async function setStatus(row: AttendanceRosterRow, status: AttendanceStatus) {
    if (!row.recordId || row.status === status) return
    const prev = roster
    setRoster((rs) => rs.map((r) => (r.studentId === row.studentId ? { ...r, status } : r)))
    try {
      await updateAttendanceStatus(row.recordId, status)
    } catch {
      setRoster(prev)
      toast('Could not update that student.', 'error')
    }
  }

  async function toggleApply() {
    const next = !apply
    setApply(next)
    try {
      await setSessionApplyPenalties(session.id, next)
    } catch {
      setApply(!next)
      toast('Could not change the penalty setting.', 'error')
    }
  }

  async function onCommit() {
    setCommitting(true)
    try {
      const { applied, deducted } = await commitAttendancePenalties(session.id)
      toast(
        applied > 0
          ? `Finalised — ${deducted} points deducted across ${applied} student${applied === 1 ? '' : 's'}.`
          : 'Attendance saved. No penalties applied.',
        'success',
      )
      onDone()
    } catch {
      toast('Could not finalise. Try again.', 'error')
      setCommitting(false)
    }
  }

  return (
    <div className="space-y-4 pb-4">
      <div>
        <h1 className="font-display text-xl font-bold">Review attendance</h1>
        <p className="text-sm text-muted">
          {session.topic ? `${session.topic} · ` : ''}
          {sectionName} · tap a student to correct their status before finalising.
        </p>
      </div>

      {/* Tallies */}
      <div className="grid grid-cols-3 gap-3">
        {TALLY_ORDER.map((s) => (
          <Card key={s} className="p-3 text-center">
            <p className={cn('font-display text-2xl font-bold tabular-nums', STATUS_META[s].text)}>
              {counts[s]}
            </p>
            <p className="text-xs text-muted">{STATUS_META[s].label}</p>
          </Card>
        ))}
      </div>

      {neutral > 0 && (
        <p className="px-1 text-xs text-muted">
          {counts.excused > 0 && `${counts.excused} excused`}
          {counts.excused > 0 && counts.irregular > 0 && ' · '}
          {counts.irregular > 0 && `${counts.irregular} irregular`} — this class doesn’t count for
          {neutral === 1 ? ' them' : ' them'}, and no points are deducted.
        </p>
      )}

      {/* Penalty control */}
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Deduct penalties</p>
          <p className="text-xs text-muted">
            Late −{session.latePenalty} · Absent −{session.absentPenalty}
            {apply ? ` · total −${deduction} pts` : ' · off for this class'}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={apply}
          onClick={toggleApply}
          className={cn(
            'relative h-6 w-11 shrink-0 rounded-full transition-colors',
            apply ? 'bg-brand-500' : 'bg-line',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-[left]',
              apply ? 'left-[1.375rem]' : 'left-0.5',
            )}
          />
        </button>
      </Card>

      {loading ? (
        <ListSkeleton rows={6} />
      ) : (
        <Card className="divide-y divide-line">
          {roster.map((r) => (
            <div key={r.studentId} className="flex items-center gap-3 p-3.5">
              <Avatar name={r.fullName} url={r.avatarUrl} />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">{r.fullName}</p>
              <div className="flex shrink-0 gap-1">
                {ORDER.map((s) => {
                  const active = r.status === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(r, s)}
                      aria-pressed={active}
                      aria-label={STATUS_META[s].label}
                      title={STATUS_META[s].label}
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold transition-colors',
                        active ? STATUS_META[s].solid : 'bg-card-2 text-muted hover:text-ink',
                      )}
                    >
                      {/* Excused/Irregular both start with a letter already in
                          use, so they get their own initials. */}
                      {s === 'excused' ? 'E' : s === 'irregular' ? 'I' : STATUS_META[s].label[0]}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </Card>
      )}

      <div className="sticky bottom-19 z-10 md:bottom-4">
        <Button
          size="lg"
          className="w-full shadow-lg"
          onClick={() => setConfirmCommit(true)}
          disabled={committing || loading}
        >
          {committing
            ? 'Finalising…'
            : apply && deduction > 0
              ? `Apply −${deduction} & finish`
              : 'Save attendance & finish'}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmCommit}
        title="Finalise this class?"
        message={
          apply && deduction > 0 ? (
            <>
              Statuses lock in and penalties apply:{' '}
              <span className="font-semibold text-ink">
                {counts.late} late (−{session.latePenalty} each) · {counts.absent} absent (−
                {session.absentPenalty} each)
              </span>
              .
            </>
          ) : (
            'Attendance is saved as-is. Penalties are off, so no points are deducted.'
          )
        }
        detail={
          apply && deduction > 0
            ? `Total deduction: −${deduction} points. You can still undo per-student from Recent activity.`
            : undefined
        }
        confirmLabel={apply && deduction > 0 ? `Apply −${deduction} & finish` : 'Finish'}
        variant={apply && deduction > 0 ? 'danger' : 'default'}
        busy={committing}
        onConfirm={() => {
          setConfirmCommit(false)
          void onCommit()
        }}
        onClose={() => setConfirmCommit(false)}
      />
    </div>
  )
}
