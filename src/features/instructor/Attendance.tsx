import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Avatar } from '@/components/ui/Avatar'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { StatusChip } from '@/components/attendance/StatusChip'
import { CalendarIcon, DownloadIcon, PencilIcon, QrIcon, TrashIcon } from '@/components/ui/icons'
import { useInstructor } from './InstructorLayout'
import { AttendanceSession } from './AttendanceSession'
import { AttendanceReview } from './AttendanceReview'
import {
  deleteSession,
  getActiveSession,
  getSession,
  listSessionAttendance,
  listSessions,
  startClassSession,
  updateSessionTopic,
} from '@/lib/api'
import { exportSessionAttendance } from '@/lib/attendance-io'
import type { AttendanceRosterRow, ClassSession, SessionSummary } from '@/lib/types'

type View = 'home' | 'live' | 'review'

const sessionDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export function Attendance() {
  const { sections, selectedSectionId, setSelectedSectionId } = useInstructor()
  const { toast } = useToast()
  const sectionName = sections.find((s) => s.id === selectedSectionId)?.name ?? ''

  const [view, setView] = useState<View>('home')
  const [session, setSession] = useState<ClassSession | null>(null)
  const [checking, setChecking] = useState(true)

  // Start config (instructor control before each class).
  const [topic, setTopic] = useState('')
  const [lateAfter, setLateAfter] = useState(10)
  const [absentAfter, setAbsentAfter] = useState(30)
  const [latePenalty, setLatePenalty] = useState(1)
  const [absentPenalty, setAbsentPenalty] = useState(5)
  const [applyPenalties, setApplyPenalties] = useState(true)
  const [starting, setStarting] = useState(false)

  const [history, setHistory] = useState<SessionSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  // Past-session detail sheet.
  const [detail, setDetail] = useState<SessionSummary | null>(null)
  const [detailRows, setDetailRows] = useState<AttendanceRosterRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  // Manage a past session (testing tools): edit topic / delete.
  const [editingTopic, setEditingTopic] = useState(false)
  const [topicDraft, setTopicDraft] = useState('')
  const [savingTopic, setSavingTopic] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadHistory = useCallback(async () => {
    if (!selectedSectionId) return
    setHistoryLoading(true)
    try {
      setHistory(await listSessions(selectedSectionId))
    } catch {
      /* non-fatal */
    } finally {
      setHistoryLoading(false)
    }
  }, [selectedSectionId])

  // On section change: resume any active session, else land on the config home.
  useEffect(() => {
    if (!selectedSectionId) return
    let cancelled = false
    setView('home')
    setSession(null)
    setChecking(true)
    getActiveSession(selectedSectionId)
      .then((s) => {
        if (cancelled) return
        if (s) {
          setSession(s)
          setView('live')
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setChecking(false))
    void loadHistory()
    return () => {
      cancelled = true
    }
  }, [selectedSectionId, loadHistory])

  const thresholdsValid = absentAfter >= lateAfter && lateAfter >= 0 && absentAfter >= 0

  async function onStart() {
    if (!selectedSectionId || !thresholdsValid) return
    setStarting(true)
    try {
      const s = await startClassSession({
        sectionId: selectedSectionId,
        topic,
        lateAfterMin: lateAfter,
        absentAfterMin: absentAfter,
        latePenalty,
        absentPenalty,
        applyPenalties,
      })
      setSession(s)
      setView('live')
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[attendance] start failed:', e)
      const msg = (e as { message?: string } | null)?.message
      toast(msg && msg.length <= 160 ? msg : 'Could not start the class. Try again.', 'error')
    } finally {
      setStarting(false)
    }
  }

  function afterReview() {
    setSession(null)
    setView('home')
    void loadHistory()
  }

  async function openDetail(s: SessionSummary) {
    setDetail(s)
    setEditingTopic(false)
    setConfirmDelete(false)
    setDetailLoading(true)
    try {
      setDetailRows(await listSessionAttendance(s.id, selectedSectionId))
    } catch {
      toast('Could not load that session.', 'error')
    } finally {
      setDetailLoading(false)
    }
  }

  async function saveTopic() {
    if (!detail) return
    setSavingTopic(true)
    try {
      await updateSessionTopic(detail.id, topicDraft)
      setDetail({ ...detail, topic: topicDraft.trim() || null })
      setEditingTopic(false)
      void loadHistory()
    } catch {
      toast('Could not save the topic.', 'error')
    } finally {
      setSavingTopic(false)
    }
  }

  async function onDeleteSession() {
    if (!detail) return
    setDeleting(true)
    try {
      await deleteSession(detail.id)
      toast('Session deleted.', 'success')
      setDetail(null)
      setConfirmDelete(false)
      void loadHistory()
    } catch {
      toast('Could not delete the session.', 'error')
    } finally {
      setDeleting(false)
    }
  }

  async function onExportDetail() {
    if (!detail) return
    try {
      await exportSessionAttendance(
        sectionName,
        detail.topic || sessionDate(detail.startedAt),
        detail.startedAt,
        detailRows,
      )
    } catch {
      toast('Could not export.', 'error')
    }
  }

  async function onFinaliseFromHistory(s: SessionSummary) {
    try {
      const full = await getSession(s.id)
      if (!full) return
      setDetail(null)
      setSession(full)
      setView('review')
    } catch {
      toast('Could not open that session.', 'error')
    }
  }

  const sectionSelect = (
    <Select
      aria-label="Section"
      value={selectedSectionId}
      onChange={(e) => setSelectedSectionId(e.target.value)}
      className="max-w-40 font-display font-bold ring-1 ring-brand-500/40"
    >
      {sections.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  )

  const detailCounts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0 }
    for (const r of detailRows) if (r.status) c[r.status] += 1
    return c
  }, [detailRows])

  if (view === 'live' && session) {
    return <AttendanceSession session={session} sectionName={sectionName} onEnd={() => setView('review')} />
  }
  if (view === 'review' && session) {
    return <AttendanceReview session={session} sectionName={sectionName} onDone={afterReview} />
  }

  return (
    <div className="space-y-5">
      {/* Sticky, highlighted section bar — pins under the app header so the
          selected section is always in view and never scrolled past. */}
      <div className="sticky top-[52px] z-10 -mx-4 -mt-5 border-b border-brand-500/20 bg-canvas/85 px-4 py-3 backdrop-blur-md md:top-0 md:-mx-8 md:mt-0 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold">Attendance</h1>
          {sectionSelect}
        </div>
      </div>

      {/* Start a class */}
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500/10 text-brand-500">
            <QrIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display font-bold">Start a class</p>
            <p className="text-xs text-muted">Students scan the QR to check in.</p>
          </div>
        </div>

        <Input
          label="Topic (optional)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g. Lecture 5: Big-O"
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Late after (min)"
            type="number"
            inputMode="numeric"
            min={0}
            value={lateAfter}
            onChange={(e) => setLateAfter(Math.max(0, parseInt(e.target.value, 10) || 0))}
          />
          <Input
            label="Absent after (min)"
            type="number"
            inputMode="numeric"
            min={0}
            value={absentAfter}
            onChange={(e) => setAbsentAfter(Math.max(0, parseInt(e.target.value, 10) || 0))}
            error={!thresholdsValid ? 'Must be ≥ late' : undefined}
          />
          <Input
            label="Late penalty (pts)"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={latePenalty}
            onChange={(e) =>
              setLatePenalty(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))
            }
          />
          <Input
            label="Absent penalty (pts)"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            value={absentPenalty}
            onChange={(e) =>
              setAbsentPenalty(Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)))
            }
          />
        </div>

        <label className="flex cursor-pointer items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink">Deduct penalties automatically</span>
            <span className="block text-xs text-muted">
              Off = record attendance only, no points deducted.
            </span>
          </span>
          <input
            type="checkbox"
            checked={applyPenalties}
            onChange={(e) => setApplyPenalties(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-brand-500"
          />
        </label>

        <Button
          size="lg"
          className="w-full"
          onClick={onStart}
          disabled={starting || checking || !selectedSectionId || !thresholdsValid}
        >
          {checking ? 'Checking…' : starting ? 'Starting…' : 'Start class & show QR'}
        </Button>
      </Card>

      {/* History */}
      <div>
        <div className="mb-2 flex items-center gap-2 px-1">
          <CalendarIcon className="h-4 w-4 text-muted" />
          <h2 className="text-sm font-semibold text-muted">Recent sessions</h2>
        </div>
        {historyLoading ? (
          <ListSkeleton rows={3} />
        ) : history.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            No sessions yet. Start a class to take attendance.
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {history.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => openDetail(s)}
                className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-card-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {s.topic || sessionDate(s.startedAt)}
                  </p>
                  <p className="text-xs text-muted">
                    {sessionDate(s.startedAt)}
                    {s.status === 'active'
                      ? ' · live now'
                      : !s.penaltiesCommitted
                        ? ' · not finalised'
                        : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs font-semibold tabular-nums">
                  <span className="text-emerald-600 dark:text-emerald-400">{s.present}</span>
                  <span className="text-gold-600 dark:text-gold-400">{s.late}</span>
                  <span className="text-brand-600 dark:text-brand-400">{s.absent}</span>
                </div>
              </button>
            ))}
          </Card>
        )}
      </div>

      {/* Past-session detail */}
      <Sheet
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? detail.topic || sessionDate(detail.startedAt) : ''}
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs">
              <StatusChip status="present" />
              <span className="tabular-nums text-muted">{detailCounts.present}</span>
              <StatusChip status="late" />
              <span className="tabular-nums text-muted">{detailCounts.late}</span>
              <StatusChip status="absent" />
              <span className="tabular-nums text-muted">{detailCounts.absent}</span>
            </div>

            {detail.status === 'ended' && !detail.penaltiesCommitted && (
              <Button className="w-full" onClick={() => onFinaliseFromHistory(detail)}>
                Review & finalise penalties
              </Button>
            )}

            {detailLoading ? (
              <ListSkeleton rows={4} />
            ) : (
              <div className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {detailRows.map((r) => (
                  <div key={r.studentId} className="flex items-center gap-3 p-3">
                    <Avatar name={r.fullName} url={r.avatarUrl} />
                    <span className="min-w-0 flex-1 truncate text-sm">{r.fullName}</span>
                    {r.status && <StatusChip status={r.status} />}
                  </div>
                ))}
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={onExportDetail}>
              <DownloadIcon className="h-5 w-5" /> Export to Excel
            </Button>

            {/* Manage — edit topic / delete (deleting reverses any penalties). */}
            <div className="space-y-3 rounded-xl border border-line p-3">
              {editingTopic ? (
                <div className="space-y-2">
                  <Input
                    label="Topic"
                    value={topicDraft}
                    onChange={(e) => setTopicDraft(e.target.value)}
                    placeholder="e.g. Lecture 5: Big-O"
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
                <button
                  type="button"
                  onClick={() => {
                    setTopicDraft(detail.topic ?? '')
                    setEditingTopic(true)
                  }}
                  className="flex w-full items-center gap-2 text-sm font-medium text-muted transition-colors hover:text-ink"
                >
                  <PencilIcon className="h-4 w-4" /> Edit topic
                </button>
              )}

              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center gap-2 text-sm font-medium text-brand-600 transition-opacity hover:opacity-80 dark:text-brand-400"
              >
                <TrashIcon className="h-4 w-4" /> Delete session
              </button>
            </div>
          </div>
        )}
      </Sheet>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this session?"
        message={
          <>
            <span className="font-semibold text-ink">
              {detail ? detail.topic || sessionDate(detail.startedAt) : 'This session'}
            </span>{' '}
            and all its check-ins will be permanently deleted. This can’t be undone.
          </>
        }
        detail={
          detail?.penaltiesCommitted
            ? 'Any penalties this session applied are reversed — student points recompute automatically.'
            : undefined
        }
        confirmLabel="Delete session"
        busy={deleting}
        onConfirm={onDeleteSession}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  )
}
