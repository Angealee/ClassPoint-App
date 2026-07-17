import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { CalendarIcon, QrIcon } from '@/components/ui/icons'
import { useInstructor } from './InstructorLayout'
import { AttendanceSession } from './AttendanceSession'
import { AttendanceReview } from './AttendanceReview'
import { getActiveSession, getSession, listSessions, startClassSession } from '@/lib/api'
import { groupByWeek } from '@/lib/term'
import type { ClassSession, SessionSummary } from '@/lib/types'

type View = 'home' | 'live' | 'review'

const sessionDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

export function Attendance() {
  const { sections, selectedSectionId, setSelectedSectionId } = useInstructor()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
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
  //
  // A pending ?review=<id> deep-link (from the session detail page) owns the
  // view instead — skip the reset so it isn't stomped back to home/live. Read
  // from searchParams at run time rather than depending on it: consuming the
  // param below clears it, and a dep would re-run this and reset the view.
  useEffect(() => {
    if (!selectedSectionId) return
    let cancelled = false
    const pendingReview = !!searchParams.get('review')
    if (!pendingReview) {
      setView('home')
      setSession(null)
    }
    setChecking(true)
    getActiveSession(selectedSectionId)
      .then((s) => {
        if (cancelled || pendingReview) return
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionId, loadHistory])

  // Consume ?review=<id> once, then strip it from the URL so a refresh or a
  // later section switch behaves normally.
  const reviewConsumedRef = useRef(false)
  const reviewParam = searchParams.get('review')
  useEffect(() => {
    if (!reviewParam || reviewConsumedRef.current) return
    reviewConsumedRef.current = true
    getSession(reviewParam)
      .then((full) => {
        if (full) {
          setSession(full)
          setView('review')
        }
      })
      .catch(() => toast('Could not open that session.', 'error'))
      .finally(() => setSearchParams({}, { replace: true }))
  }, [reviewParam, setSearchParams, toast])

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

  // Newest week first, matching the list's newest-first order.
  const weeks = useMemo(() => groupByWeek(history, (s) => s.startedAt), [history])

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

      {/* History — grouped by term week, newest first */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2 px-1">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-muted" />
            <h2 className="text-sm font-semibold text-muted">Recent sessions</h2>
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => navigate('/teach/attendance/history')}
              className="text-xs font-semibold text-brand-500 transition-opacity hover:opacity-80"
            >
              See all & stats →
            </button>
          )}
        </div>
        {historyLoading ? (
          <ListSkeleton rows={3} />
        ) : history.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted">
            No sessions yet. Start a class to take attendance.
          </Card>
        ) : (
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
                        {s.excused + s.irregular > 0 && (
                          <span className="text-muted">+{s.excused + s.irregular}</span>
                        )}
                      </div>
                    </button>
                  ))}
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
