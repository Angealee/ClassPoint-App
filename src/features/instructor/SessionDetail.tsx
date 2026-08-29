import { EmptyState } from '@/components/ui/EmptyState'
import { IconButton } from '@/components/ui/IconButton'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar } from '@/components/ui/Avatar'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { StatusChip, STATUS_META } from '@/components/attendance/StatusChip'
import {
  ArrowLeftIcon,
  DownloadIcon,
  PencilIcon,
  TrashIcon,
} from '@/components/ui/icons'
import {
  createAttendanceRecord,
  deleteAttendanceRecord,
  deleteSession,
  getSession,
  listSessionAttendance,
  updateAttendanceStatus,
  updateSessionSubject,
  updateSessionTopic,
} from '@/lib/api'
import { exportSessionAttendance } from '@/lib/attendance-io'
import { termLabel, termOf, weekLabel, weekOf } from '@/lib/term'
import { errorText } from '@/lib/errors'
import { cn } from '@/lib/cn'
import { useInstructor } from './InstructorLayout'
import type { AttendanceRosterRow, AttendanceStatus, ClassSession } from '@/lib/types'

const ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'excused', 'irregular']

const sessionDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * One past session, in full: every student grouped by status, editable after
 * the fact (penalties reconcile automatically), exportable, deletable.
 */
export function SessionDetail() {
  const { sessionId = '' } = useParams()
  const navigate = useNavigate()
  const { sections, subjectsForSection } = useInstructor()
  const { toast } = useToast()

  const [session, setSession] = useState<ClassSession | null>(null)
  const [rows, setRows] = useState<AttendanceRosterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [editingTopic, setEditingTopic] = useState(false)
  const [topicDraft, setTopicDraft] = useState('')
  const [savingTopic, setSavingTopic] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [picker, setPicker] = useState<AttendanceRosterRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [editingSubject, setEditingSubject] = useState(false)
  const [savingSubject, setSavingSubject] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<AttendanceRosterRow | null>(null)

  const sectionName = sections.find((s) => s.id === session?.sectionId)?.name ?? ''
  const sessionSubjects = subjectsForSection(session?.sectionId ?? '')

  const load = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const s = await getSession(sessionId)
      if (!s) {
        setNotFound(true)
        return
      }
      setSession(s)
      setRows(await listSessionAttendance(s.id, s.sectionId))
    } catch {
      toast('Could not load that session.', 'error')
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [sessionId, toast])

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
    for (const r of rows) if (r.status) c[r.status] += 1
    return c
  }, [rows])

  const syncedLateCount = useMemo(() => rows.filter((r) => r.syncedLate).length, [rows])

  const grouped = useMemo(
    () =>
      ORDER.map((status) => ({
        status,
        items: rows.filter((r) => r.status === status),
      })).filter((g) => g.items.length > 0),
    [rows],
  )
  const unmarked = useMemo(() => rows.filter((r) => !r.status), [rows])

  /**
   * What changing this student's status will do to their points. Only
   * meaningful once penalties are committed — before that, nothing has been
   * deducted yet and the whole thing settles at finalise time.
   */
  function penaltyEffect(row: AttendanceRosterRow, next: AttendanceStatus): string | null {
    if (!session?.penaltiesCommitted || !session.applyPenalties) return null
    const cost = (s: AttendanceStatus | null) =>
      s === 'late' ? session.latePenalty : s === 'absent' ? session.absentPenalty : 0
    const before = cost(row.status)
    const after = cost(next)
    if (before === after) return null
    if (before > 0 && after === 0) return `gives back −${before}`
    if (before === 0 && after > 0) return `deducts −${after}`
    return `−${before} becomes −${after}`
  }

  async function setStatus(row: AttendanceRosterRow, status: AttendanceStatus) {
    if (row.recordId && row.status === status) {
      setPicker(null)
      return
    }
    if (!session) return
    setSaving(true)
    const prev = rows
    setRows((rs) => rs.map((r) => (r.studentId === row.studentId ? { ...r, status } : r)))
    try {
      if (row.recordId) {
        await updateAttendanceStatus(row.recordId, status)
      } else {
        // No record yet (end-of-class skipped them, or they joined the section
        // later). Creating it goes through the same penalty reconciliation.
        await createAttendanceRecord(session.id, row.studentId, status)
        await load()
      }
      setPicker(null)
    } catch (e) {
      setRows(prev)
      toast(errorText(e, 'Could not update that student.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  /** Remove a record entirely — back to "no record" (0031/Phase B). */
  async function removeRecord(row: AttendanceRosterRow) {
    if (!row.recordId) return
    setSaving(true)
    try {
      await deleteAttendanceRecord(row.recordId)
      setPicker(null)
      setRemoveTarget(null)
      await load()
      toast(`${row.fullName}'s record removed.`, 'success')
    } catch (e) {
      toast(errorText(e, 'Could not remove that record.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  /** Re-tag (or untag) the session's subject — the fix for a mis-picked subject. */
  async function saveSubject(subjectId: string | null) {
    if (!session) return
    setSavingSubject(true)
    try {
      await updateSessionSubject(session.id, subjectId)
      await load()
      setEditingSubject(false)
    } catch (e) {
      toast(errorText(e, 'Could not change the subject.'), 'error')
    } finally {
      setSavingSubject(false)
    }
  }

  async function saveTopic() {
    if (!session) return
    setSavingTopic(true)
    try {
      await updateSessionTopic(session.id, topicDraft)
      setSession({ ...session, topic: topicDraft.trim() || null })
      setEditingTopic(false)
    } catch {
      toast('Could not save the topic.', 'error')
    } finally {
      setSavingTopic(false)
    }
  }

  async function onDelete() {
    if (!session) return
    setDeleting(true)
    try {
      await deleteSession(session.id)
      toast('Session deleted.', 'success')
      navigate('/teach/attendance', { replace: true })
    } catch {
      toast('Could not delete the session.', 'error')
      setDeleting(false)
    }
  }

  async function onExport() {
    if (!session) return
    try {
      await exportSessionAttendance(
        sectionName,
        session.topic || sessionDate(session.startedAt),
        session.startedAt,
        rows,
      )
    } catch {
      toast('Could not export.', 'error')
    }
  }

  if (notFound) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate('/teach/attendance')} />
        <EmptyState>That session no longer exists.</EmptyState>
      </div>
    )
  }

  if (loading || !session) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => navigate('/teach/attendance')} />
        <Card pad="none" className="h-24 animate-pulse bg-card-2" />
        <ListSkeleton rows={6} />
      </div>
    )
  }

  const week = weekOf(session.startedAt)

  return (
    <div className="space-y-4 pb-4">
      <BackLink onClick={() => navigate('/teach/attendance')} />

      {/* Header */}
      <Card className="space-y-3 p-5">
        {editingTopic ? (
          <div className="space-y-2">
            <Input
              label="Topic"
              value={topicDraft}
              onChange={(e) => setTopicDraft(e.target.value)}
              placeholder="e.g. Lecture 5: Big-O"
              autoFocus
            />
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={() => setEditingTopic(false)} disabled={savingTopic}>
                Cancel
              </Button>
              <Button onClick={saveTopic} disabled={savingTopic}>
                {savingTopic ? 'Saving…' : 'Save topic'}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-xl font-bold">
                {session.topic || sessionDate(session.startedAt)}
              </h1>
              <p className="text-sm text-muted">
                {session.subjectCode ? `${session.subjectCode} · ` : ''}
                {sectionName} · {termLabel(termOf(session.startedAt))} · {weekLabel(week)}
              </p>
            </div>
                        <IconButton
              label="Edit topic"
              onClick={() => {
                setTopicDraft(session.topic ?? '')
                setEditingTopic(true)
              }}
              icon={<PencilIcon className="h-4.5 w-4.5" />}
            />
          </div>
        )}

        {/* Subject — editable. A session started under the wrong subject (the
            picker pre-fills from your last one) used to be permanent, silently
            skewing per-subject rates and the 0030 achievement metrics. */}
        {sessionSubjects.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {editingSubject ? (
              <>
                {sessionSubjects.map((subject) => (
                  <button
                    key={subject.id}
                    type="button"
                    disabled={savingSubject}
                    onClick={() => void saveSubject(subject.id)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50',
                      subject.id === session.subjectId
                        ? 'border-brand-500 bg-brand-500/10 text-brand-500'
                        : 'border-line text-muted hover:border-brand-500 hover:text-brand-500',
                    )}
                  >
                    {subject.code}
                  </button>
                ))}
                {session.subjectId && (
                  <button
                    type="button"
                    disabled={savingSubject}
                    onClick={() => void saveSubject(null)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-ink disabled:opacity-50"
                  >
                    Untag
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingSubject(false)}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-muted transition-colors hover:text-ink"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setEditingSubject(true)}
                className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-brand-500 hover:text-brand-500"
              >
                {session.subjectCode ? `Subject: ${session.subjectCode}` : 'No subject — tag it'}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{sessionDate(session.startedAt)}</span>
          <span>·</span>
          <span>
            {clockTime(session.startedAt)}
            {session.endedAt ? `–${clockTime(session.endedAt)}` : ''}
          </span>
          <span>·</span>
          <span>
            Late after {session.lateAfterMin}m · Absent after {session.absentAfterMin}m
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {session.status === 'active' && (
            <span className="rounded-full bg-success-solid/10 px-2.5 py-1 text-xs font-semibold text-success">
              Live now
            </span>
          )}
          <span
            className={cn(
              'rounded-full px-2.5 py-1 text-xs font-semibold',
              session.penaltiesCommitted
                ? 'bg-card-2 text-muted'
                : 'bg-gold-400/15 text-warn',
            )}
          >
            {session.penaltiesCommitted ? 'Finalised' : 'Not finalised'}
          </span>
          {!session.applyPenalties && (
            <span className="rounded-full bg-card-2 px-2.5 py-1 text-xs font-semibold text-muted">
              Penalties off
            </span>
          )}
        </div>

        {session.status === 'ended' && !session.penaltiesCommitted && (
          <Button
            className="w-full"
            onClick={() => navigate(`/teach/attendance?review=${session.id}`)}
          >
            Review & finalise penalties
          </Button>
        )}
      </Card>

      {/* Tallies */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {ORDER.map((s) => (
          <Card key={s} className="p-3 text-center">
            <p className={cn('font-display text-xl font-bold tabular-nums', STATUS_META[s].text)}>
              {counts[s]}
            </p>
            <p className="text-xs text-muted">{STATUS_META[s].label}</p>
          </Card>
        ))}
      </div>

      <p className="px-1 text-xs text-muted">
        Tap any student to correct their status.
        {session.penaltiesCommitted && ' Points are adjusted automatically.'}
        {syncedLateCount > 0 && (
          <span className="text-info">
            {' '}
            {syncedLateCount} synced from an offline check-in.
          </span>
        )}
      </p>

      {/* Roster, grouped by status */}
      {grouped.map((g) => (
        <div key={g.status}>
          <div className="mb-2 flex items-center gap-2 px-1">
            <StatusChip status={g.status} />
            <span className="text-xs tabular-nums text-muted">{g.items.length}</span>
          </div>
          <Card pad="none" className="divide-y divide-line">
            {g.items.map((r) => (
              <button
                key={r.studentId}
                type="button"
                onClick={() => setPicker(r)}
                className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-card-2"
              >
                <Avatar name={r.fullName} url={r.avatarUrl} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {r.fullName}
                  {r.archived && (
                    <span className="ml-1.5 rounded-full bg-card-2 px-1.5 py-0.5 text-2xs font-medium text-muted">
                      archived
                    </span>
                  )}
                </span>
                {r.syncedLate && (
                  <span className="shrink-0 rounded-full bg-info-solid/10 px-1.5 py-0.5 text-2xs font-medium text-info">
                    Offline
                  </span>
                )}
                {r.scannedAt && (
                  <span className="shrink-0 text-xs tabular-nums text-muted">
                    {clockTime(r.scannedAt)}
                  </span>
                )}
              </button>
            ))}
          </Card>
        </div>
      ))}

      {unmarked.length > 0 && (
        <div>
          <p className="mb-2 px-1 text-xs font-semibold text-muted">
            No record ({unmarked.length})
          </p>
          <Card pad="none" className="divide-y divide-line">
            {/* Tappable: a student with no record can now be given one. The
                picker routes through set_attendance_status, so the points
                ledger lands exactly as it would have during class. */}
            {unmarked.map((r) => (
              <button
                key={r.studentId}
                type="button"
                onClick={() => setPicker(r)}
                className="flex w-full items-center gap-3 p-3.5 text-left transition-colors hover:bg-card-2"
              >
                <Avatar name={r.fullName} url={r.avatarUrl} />
                <span className="min-w-0 flex-1 truncate text-sm text-muted">{r.fullName}</span>
                <span className="shrink-0 text-xs font-semibold text-brand-500">Add record</span>
              </button>
            ))}
          </Card>
        </div>
      )}

      <div className="space-y-2">
        <Button variant="outline" className="w-full" onClick={onExport}>
          <DownloadIcon className="h-5 w-5" /> Export to Excel
        </Button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-danger transition-opacity hover:opacity-80"
        >
          <TrashIcon className="h-4 w-4" /> Delete session
        </button>
      </div>

      {/* Status picker */}
      <Sheet
        open={!!picker}
        onClose={() => setPicker(null)}
        title={picker?.fullName ?? ''}
      >
        {picker && (
          <div className="space-y-2">
            {ORDER.map((s) => {
              const active = picker.status === s
              const effect = penaltyEffect(picker, s)
              return (
                <button
                  key={s}
                  type="button"
                  disabled={saving}
                  onClick={() => void setStatus(picker, s)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors disabled:opacity-60',
                    active ? 'border-brand-500/40 bg-brand-500/5' : 'border-line hover:bg-card-2',
                  )}
                >
                  <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', STATUS_META[s].dot)} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{STATUS_META[s].label}</span>
                    {effect && (
                      <span className="block text-xs text-muted">Changing to this {effect}</span>
                    )}
                  </span>
                  {active && <span className="shrink-0 text-xs font-semibold text-brand-500">Current</span>}
                </button>
              )
            })}
            <p className="pt-1 text-xs text-muted">
              Excused and Irregular don’t count for this student — no penalty, and the class is left
              out of their attendance rate and streaks.
            </p>
            {picker.recordId ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => setRemoveTarget(picker)}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-danger transition-opacity hover:opacity-80 disabled:opacity-50"
              >
                <TrashIcon className="h-4 w-4" /> Remove record
              </button>
            ) : (
              <p className="rounded-xl bg-card-2 px-3 py-2 text-xs text-muted">
                This student has no record for this class yet. Picking a status creates one, with
                the same points effect it would have had on the day.
              </p>
            )}
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={!!removeTarget}
        title="Remove this record?"
        message={
          removeTarget ? (
            <>
              <span className="font-semibold text-ink">{removeTarget.fullName}</span> goes back to
              having no record for this class — it leaves their attendance rate entirely.
            </>
          ) : (
            ''
          )
        }
        detail={
          removeTarget?.status === 'late' || removeTarget?.status === 'absent'
            ? 'Any penalty this record carried is given back.'
            : undefined
        }
        confirmLabel="Remove"
        busy={saving}
        onClose={() => setRemoveTarget(null)}
        onConfirm={() => removeTarget && void removeRecord(removeTarget)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this session?"
        message={
          <>
            <span className="font-semibold text-ink">
              {session.topic || sessionDate(session.startedAt)}
            </span>{' '}
            and all its check-ins will be permanently deleted. This can’t be undone.
          </>
        }
        detail={
          session.penaltiesCommitted
            ? 'Any penalties this session applied are reversed — student points recompute automatically.'
            : undefined
        }
        confirmLabel="Delete session"
        busy={deleting}
        onConfirm={onDelete}
        onClose={() => setConfirmDelete(false)}
      />
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
      <ArrowLeftIcon className="h-4 w-4" /> Attendance
    </button>
  )
}
